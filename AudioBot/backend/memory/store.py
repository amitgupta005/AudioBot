# backend/app/memory/store.py

import redis
import json
from typing import List


class MemoryStore:
    """
    Redis-backed conversation memory.
    Stores conversation as an ordered list of strings.
    """

    def __init__(self, host="localhost", port=6379, db=0):
        self.client = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=True,
        )

    def get_conversation(self, conversation_id: str) -> List[str]:
        data = self.client.get(conversation_id)
        if not data:
            return []
        return json.loads(data)

    def save_conversation(self, conversation_id: str, conversation: List[str]):
        self.client.set(conversation_id, json.dumps(conversation))
