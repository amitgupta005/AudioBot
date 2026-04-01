"""Direct MongoDB service for storing conversations and reports"""
import logging
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from app.config import MONGODB_URL, MONGODB_DATABASE

logger = logging.getLogger(__name__)


class MongoService:
    _client = None
    _db = None
    _connection_failed = False

    @classmethod
    def _get_db(cls):
        """Get MongoDB database connection"""
        # If connection already failed, don't retry every call
        if cls._connection_failed:
            logger.debug("⚠️  MongoDB previously failed to connect, skipping")
            return None
            
        if cls._db is None:
            try:
                cls._client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
                cls._db = cls._client[MONGODB_DATABASE]
                # Verify connection
                cls._client.admin.command('ping')
                logger.info(f"✅ Connected to MongoDB: {MONGODB_DATABASE}")
            except Exception as e:
                logger.warning(f"⚠️  MongoDB connection failed: {e}. Running without persistent storage.")
                cls._connection_failed = True
                cls._db = None
                return None
        return cls._db

    @classmethod
    def create_conversation(cls, session_id: str, user_id: str = None, job_id: str = None):
        """Create a conversation in MongoDB"""
        try:
            db = cls._get_db()
            if db is None:
                logger.warning(f"⚠️  MongoDB unavailable, skipping conversation creation for {session_id}")
                return None
                
            collection = db["conversations"]
            
            conversation = {
                "sessionId": session_id,
                "userId": user_id,
                "jobId": job_id,
                "title": "New Conversation",
                "messages": [],
                "messageCount": 0,
                "isActive": True,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
                "report": {
                    "pdfUrl": None,
                    "uploadedAt": None,
                    "generatedAt": None,
                }
            }
            
            result = collection.insert_one(conversation)
            logger.info(f"✅ Created conversation {session_id} in MongoDB")
            return conversation
        except PyMongoError as e:
            logger.error(f"❌ Failed to create conversation: {e}")
            return None

    @classmethod
    def get_conversation(cls, session_id: str):
        """Get a conversation from MongoDB"""
        try:
            db = cls._get_db()
            if db is None:
                return None
            collection = db["conversations"]
            return collection.find_one({"sessionId": session_id})
        except PyMongoError as e:
            logger.warning(f"⚠️  Failed to get conversation: {e}")
            return None

    @classmethod
    def update_report(cls, session_id: str, report_url: str):
        """Update report URL in conversation
        
        IMPORTANT: Conversation MUST exist first (created via POST /conversations/start in node-middleware).
        Does NOT create orphan conversations.
        """
        try:
            db = cls._get_db()
            if db is None:
                logger.warning(f"⚠️  MongoDB unavailable, skipping report update for {session_id}")
                return False
                
            collection = db["conversations"]
            
            result = collection.update_one(
                {"sessionId": session_id},
                {
                    "$set": {
                        "report.pdfUrl": report_url,
                        "report.uploadedAt": datetime.utcnow(),
                        "report.generatedAt": datetime.utcnow(),
                        "updatedAt": datetime.utcnow(),
                    }
                },
                upsert=False
            )
            
            if result.matched_count > 0:
                logger.info(f"✅ Updated report for {session_id}: {report_url}")
                return True
            else:
                # ❌ FAIL - conversation doesn't exist, don't create orphan
                logger.warning(f"⚠️  Conversation {session_id} not found in MongoDB. "
                           f"Will be created on first resume/jd upload.")
                return False
        except PyMongoError as e:
            logger.warning(f"⚠️  Failed to update report: {e}")
            return False

    @classmethod
    def get_all_conversations(cls, limit: int = 50, skip: int = 0):
        """Get all conversations from MongoDB"""
        try:
            db = cls._get_db()
            if db is None:
                logger.warning(f"⚠️  MongoDB unavailable, returning empty conversations list")
                return {"conversations": [], "total": 0}
                
            collection = db["conversations"]
            conversations = list(collection.find().sort("createdAt", -1).skip(skip).limit(limit))
            total = collection.count_documents({})
            return {"conversations": conversations, "total": total}
        except PyMongoError as e:
            logger.warning(f"⚠️  Failed to get conversations: {e}")
            return {"conversations": [], "total": 0}

    @classmethod
    def add_message(cls, session_id: str, role: str, content: str):
        """Add a message to conversation"""
        try:
            db = cls._get_db()
            if db is None:
                logger.debug(f"⚠️  MongoDB unavailable, skipping message persistence for {session_id}")
                return False
                
            collection = db["conversations"]
            
            message = {
                "role": role,
                "content": content,
                "type": "text",
                "timestamp": datetime.utcnow(),
            }
            
            result = collection.update_one(
                {"sessionId": session_id},
                {
                    "$push": {"messages": message},
                    "$inc": {"messageCount": 1},
                    "$set": {"updatedAt": datetime.utcnow()}
                }
            )
            
            return result.matched_count > 0
        except PyMongoError as e:
            logger.warning(f"⚠️  Failed to add message: {e}")
            return False

    @classmethod
    def update_conversation(cls, session_id: str, updates: dict):
        """Update conversation with arbitrary fields
        
        Args:
            session_id: The conversation session ID
            updates: Dictionary of fields to update
        """
        try:
            db = cls._get_db()
            if db is None:
                logger.warning(f"⚠️  MongoDB unavailable, skipping conversation update for {session_id}")
                return False
                
            collection = db["conversations"]
            
            # Add updatedAt timestamp
            update_data = {**updates, "updatedAt": datetime.utcnow()}
            
            result = collection.update_one(
                {"sessionId": session_id},
                {"$set": update_data},
                upsert=False
            )
            
            if result.matched_count > 0:
                logger.info(f"✅ Updated conversation {session_id}")
                return True
            else:
                logger.warning(f"⚠️  Conversation {session_id} not found in MongoDB")
                return False
        except PyMongoError as e:
            logger.warning(f"⚠️  Failed to update conversation: {e}")
            return False
