# backend/app/memory/store.py

import redis
import json
import logging
from typing import List
from datetime import datetime
from app.config import REDIS_HOST, REDIS_PORT, REDIS_DB, MONGODB_URL, MONGODB_DATABASE

logger = logging.getLogger(__name__)

# MongoDB client (lazy-loaded)
_mongo_client = None
_mongo_db = None

def get_mongodb():
    """Get MongoDB client and database connection."""
    global _mongo_client, _mongo_db
    try:
        if _mongo_client is None:
            from pymongo import MongoClient
            _mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
            # Test connection
            _mongo_client.admin.command('ping')
            _mongo_db = _mongo_client[MONGODB_DATABASE]
            logger.debug(f"Connected to MongoDB: {MONGODB_DATABASE}")
        return _mongo_db
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e}")
        return None


class MemoryStore:
    """
    Redis-backed conversation memory with TTL and self-cleaning indexing.
    """

    CONVERSATION_INDEX_KEY = "conversation:index"

    def __init__(
        self,
        host: str = REDIS_HOST,
        port: int = REDIS_PORT,
        db: int = REDIS_DB,
        ttl_seconds: int = 1800,
    ):
        try:
            self.client = redis.Redis(
                host=host,
                port=port,
                db=db,
                decode_responses=True,
            )
            self.client.ping()
            logger.info(f"Connected to Redis at {host}:{port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise e

        self.ttl_seconds = ttl_seconds

    def get_conversation(self, conversation_id: str) -> List[str]:
        try:
            # Try Redis first (fast)
            data = self.client.get(conversation_id)
            if data:
                return json.loads(data)
            
            # Fall back to MongoDB if Redis is empty
            db = get_mongodb()
            if db:
                try:
                    doc = db.conversations.find_one(
                        {"sessionId": conversation_id},
                        {"messages": 1}
                    )
                    if doc and "messages" in doc:
                        messages = doc["messages"]
                        # Rehydrate to Redis for next access
                        self.client.setex(
                            conversation_id,
                            self.ttl_seconds,
                            json.dumps(messages),
                        )
                        logger.debug(f"Retrieved conversation {conversation_id} from MongoDB")
                        return messages
                except Exception as e:
                    logger.warning(f"Failed to retrieve conversation {conversation_id} from MongoDB: {e}")
            
            return []
        except Exception as e:
            logger.error(f"Error getting conversation {conversation_id}: {e}")
            return []

    def save_conversation(self, conversation_id: str, conversation: List[str]):
        try:
            # 1. Save to Redis (fast, hot cache with TTL)
            self.client.setex(
                conversation_id,
                self.ttl_seconds,
                json.dumps(conversation),
            )
            # Track conversation ID for admin purposes
            self.client.sadd(self.CONVERSATION_INDEX_KEY, conversation_id)
            logger.debug(f"Saved conversation {conversation_id} to Redis")
            
            # 2. Also save to MongoDB (persistent storage)
            db = get_mongodb()
            if db:
                try:
                    # Upsert conversation to MongoDB
                    db.conversations.update_one(
                        {"sessionId": conversation_id},
                        {
                            "$set": {
                                "messages": conversation,
                                "lastUpdated": datetime.utcnow(),
                                "source": "python_backend",
                            }
                        },
                        upsert=True
                    )
                    logger.debug(f"Saved conversation {conversation_id} to MongoDB")
                except Exception as e:
                    logger.warning(f"Failed to save conversation {conversation_id} to MongoDB: {e}")
                    # Don't fail the entire operation if MongoDB is unavailable
        except Exception as e:
            logger.error(f"Error saving conversation {conversation_id}: {e}")

    def list_conversations(self) -> List[str]:
        """
        Returns all known conversation IDs, filtering out those that have expired.
        Cleans up the index set as it goes.
        """
        try:
            all_ids = list(self.client.smembers(self.CONVERSATION_INDEX_KEY))
            valid_ids = []
            for conv_id in all_ids:
                if self.client.exists(conv_id):
                    valid_ids.append(conv_id)
                else:
                    # Clean up the index specifically for IDs that no longer exist in Redis
                    self.client.srem(self.CONVERSATION_INDEX_KEY, conv_id)
            return valid_ids
        except Exception as e:
            logger.error(f"Error listing conversations: {e}")
            return []