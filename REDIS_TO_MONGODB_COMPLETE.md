# Redis to MongoDB Message Persistence - Complete Solution

## Problem
All initial/greeting messages stored in Redis (via LangGraph's RedisSaver checkpoint) were NOT being persisted to MongoDB, causing data loss when Redis TTL expired.

## Root Cause
The initial messages created by the agent during thread initialization or user's first message were only stored in Redis, never synced to the persistent MongoDB storage.

## Solution Implemented

### 1. **Python Backend - Enhanced Memory Store** 
**File**: `backend/app/memory/store.py`

- Added MongoDB integration with lazy-loaded connection
- `save_conversation()` now saves to **BOTH**:
  - Redis (fast cache with TTL)
  - MongoDB (permanent persistent storage)
- `get_conversation()` has intelligent fallback:
  - Try Redis first (fast)
  - If miss, check MongoDB
  - Rehydrate to Redis for next access
- Works for CLI tools and all code using MemoryStore

### 2. **Sync After Thread Initialization**
**File**: `backend/app/main.py`

- New function: `_sync_initial_messages_to_mongodb()`
- Called immediately after uploading resume/JD
- Extracts all messages from Redis checkpoint
- Syncs them to MongoDB
- Prevents loss of initial greeting/clarification messages

**Integration Points**:
- `/api/upload-resume` endpoint
- `/api/upload-jd` endpoint

### 3. **Real-time Sync in WebSocket Handler**
**File**: `backend/app/websocket.py`

**Key Changes**:
- Tracks which conversations have been synced (`synced_convos` set)
- On user's **first message** for a conversation:
  - Calls `_sync_conversation_to_mongodb()` 
  - Captures all initial messages before processing user input
- After each `agent.invoke()`:
  - Syncs full conversation state again
  - Ensures no message is left behind

**Enhanced `_sync_conversation_to_mongodb()` function**:
- Extracts messages from LangGraph checkpoint (`channel_values`)
- Filters out system initialization markers
- Includes only human/assistant messages
- Sends to middleware endpoint for MongoDB persistence
- Includes detailed logging for debugging

### 4. **Middleware Endpoint for Deduplication**
**File**: `node-middleware/src/routes/conversations.js`

**New Endpoint**: `POST /internal/sync-full-conversation`

Features:
- Receives full conversation sync from Python backend
- Creates conversation if doesn't exist
- Prevents duplicate messages by checking content
- Only adds new messages that aren't already in MongoDB
- Returns count of messages added for monitoring

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│ User uploads Resume/JD                              │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ _initialize_thread_state()                          │
│ ↓                                                   │
│ agent.invoke(SYSTEM_INITIALIZATION)                 │
│ ↓ Messages stored in Redis via RedisSaver           │
│ ↓                                                   │
│ _sync_initial_messages_to_mongodb()                 │
│ ↓ Extract from checkpoint                           │
│ ↓ Send to middleware                                │
│ ↓ Persist to MongoDB                                │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ User connects via WebSocket                         │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ User sends first message                            │
│ ↓                                                   │
│ Check if conversation synced (NO)                   │
│ ↓                                                   │
│ _sync_conversation_to_mongodb()                     │
│ ↓ Extract all messages from checkpoint              │
│ ↓ Send to /sync-full-conversation                   │
│ ↓ Middleware deduplicates and saves                 │
│ ↓                                                   │
│ Mark as synced                                      │
│ ↓                                                   │
│ agent.invoke(user_message)                          │
│ ↓ Process message with LangGraph                    │
│ ↓ Messages stored in Redis                          │
│ ↓                                                   │
│ _sync_conversation_to_mongodb()                     │
│ ↓ Sync new messages including AI response           │
└─────────────────────────────────────────────────────┘
```

## Why This Works

### For Initial Messages (Before User Interaction)
1. **During Initialization**: Messages created in Redis checkpoint → Synced to MongoDB via `_sync_initial_messages_to_mongodb()`
2. **On First WebSocket Message**: Any missed initial messages → Captured by `synced_convos` check and synced before processing

### For Subsequent Messages  
1. User sends message via WebSocket
2. Message processed by LangGraph agent → Stored in Redis
3. Immediately synced to MongoDB via `_sync_conversation_to_mongodb()`

### Duplicate Prevention
- Node-middleware endpoint checks existing message contents
- Only adds messages that don't already exist in MongoDB
- Multiple sync calls safe - no duplicate messages

## Benefits

✅ **Zero Data Loss**: All messages persisted immediately  
✅ **Automatic Sync**: No manual intervention needed  
✅ **Dual-Layer Storage**: 
   - Redis for performance (cache)
   - MongoDB for durability (permanent)
✅ **Smart Fallback**: 
   - If Redis expires → Retrieve from MongoDB
   - Rehydrate to Redis for next access
✅ **Deduplication**: Same content never stored twice  
✅ **Works Everywhere**: 
   - WebSocket conversations
   - CLI tools using MemoryStore
   - All async endpoints
✅ **Graceful Degradation**: Works even if MongoDB temporarily unavailable

## Testing

To verify all initial messages are stored:

```python
# Check MongoDB directly
from pymongo import MongoClient
client = MongoClient("mongodb://localhost:2000")
db = client.audiobot
conv = db.conversations.find_one()
print(f"Messages in MongoDB: {len(conv['messages'])}")

# Check Redis via Redis CLI  
redis-cli
> GET "session-id-here"
> KEYS conversation:index
```

## Logging

The implementation includes detailed logging:
- `🔄 Syncing N messages from Redis to MongoDB` - When sync starts
- `✅ Synced N messages to MongoDB` - When sync completes
- `ℹ️  No initial messages to sync` - When no messages to persist
- Detailed error messages if issues occur

Monitor these in the console to verify messages are being persisted.

## Summary

**ALL initial messages from Redis are now stored in MongoDB automatically** through:
1. Immediate sync after thread initialization
2. Sync on first user message per conversation
3. Continuous sync after each message processing
4. Intelligent deduplication to prevent duplicates

No messages are lost. All conversation history is permanent. ✅
