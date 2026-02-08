# backend/app/memory/store.py

import redis
import json
import logging
from typing import List
from app.config import REDIS_HOST, REDIS_PORT, REDIS_DB

logger = logging.getLogger(__name__)


class MemoryStore:
    """
    Redis-backed conversation memory with TTL.
    """

    def __init__(
        self,
        host: str = REDIS_HOST,
        port: int = REDIS_PORT,
        db: int = REDIS_DB,
        ttl_seconds: int = 1800,  # 30 minutes
    ):
        try:
            self.client = redis.Redis(
                host=host,
                port=port,
                db=db,
                decode_responses=True,
            )
            # Test connection
            self.client.ping()
            logger.info(f"Connected to Redis at {host}:{port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise e
        
        self.ttl_seconds = ttl_seconds

    def get_conversation(self, conversation_id: str) -> List[str]:
        try:
            data = self.client.get(conversation_id)
            if not data:
                return []
            return json.loads(data)
        except Exception as e:
            logger.error(f"Error getting conversation {conversation_id}: {e}")
            return []

    def save_conversation(
        self,
        conversation_id: str,
        conversation: List[str],
    ):
        try:
            self.client.setex(
                conversation_id,
                self.ttl_seconds,
                json.dumps(conversation),
            )
        except Exception as e:
            logger.error(f"Error saving conversation {conversation_id}: {e}")
