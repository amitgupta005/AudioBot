# backend/app/memory/store.py

import redis
import json
import logging
from typing import List
from app.config import REDIS_HOST, REDIS_PORT, REDIS_DB

logger = logging.getLogger(__name__)


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
            data = self.client.get(conversation_id)
            if not data:
                return []
            return json.loads(data)
        except Exception as e:
            logger.error(f"Error getting conversation {conversation_id}: {e}")
            return []

    def save_conversation(self, conversation_id: str, conversation: List[str]):
        try:
            # Save conversation with TTL
            self.client.setex(
                conversation_id,
                self.ttl_seconds,
                json.dumps(conversation),
            )
            # Track conversation ID for admin purposes
            self.client.sadd(self.CONVERSATION_INDEX_KEY, conversation_id)
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