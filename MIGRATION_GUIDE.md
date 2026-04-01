# Redis to MongoDB Message Migration Guide

## Overview

This solution ensures all messages from Redis are stored persistently in MongoDB, preventing data loss when Redis TTL expires.

### Architecture

**Before Migration:**
- Messages cached in Redis (with TTL, auto-expiring)
- Node gateway saves messages to MongoDB
- Python backend stores conversations only in Redis (temporary)

**After Migration:**
- All conversations from Redis are migrated to MongoDB
- Python backend now saves to both Redis (cache) and MongoDB (persistent storage)
- Messages are always retrievable even after Redis TTL expires

---

## Files Created/Modified

### New Files

1. **`backend/migrate_redis_to_mongodb.py`** - Main migration script
   - Retrieves all conversations from Redis
   - Migrates them to MongoDB
   - Includes verification and dry-run modes

2. **`backend/verify_migration.py`** - Verification and audit script
   - Checks Redis vs MongoDB consistency
   - Generates detailed reports
   - Exports CSV reports

### Modified Files

3. **`backend/app/memory/store.py`** - Enhanced memory store
   - Now saves to both Redis and MongoDB
   - Falls back to MongoDB if Redis TTL expires
   - New helper methods for stats and cleanup

---

## Quick Start

### Prerequisites

```bash
cd backend
pip install -r requirements.txt
```

Ensure MongoDB and Redis are running and accessible via env variables:
- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection URL (or REDIS_HOST, REDIS_PORT, REDIS_DB)

### Step 1: Dry Run (Recommended First Step)

See what would be migrated without making any changes:

```bash
python migrate_redis_to_mongodb.py --dry-run
```

Output will show:
- Number of conversations in Redis
- Which conversations would be migrated
- Any errors that would occur

### Step 2: Perform Migration

Run the actual migration:

```bash
python migrate_redis_to_mongodb.py
```

The script will:
1. Connect to Redis and retrieve all conversation IDs
2. Load each conversation's messages
3. Save to MongoDB (upsert to avoid overwriting existing data)
4. Automatically verify results

### Step 3: Verify Migration

Run detailed verification:

```bash
python verify_migration.py
```

For comprehensive checks including message content:

```bash
python verify_migration.py --check-integrity
```

### Step 4: Export Report (Optional)

Export detailed findings to CSV:

```bash
python verify_migration.py --export migration_report.csv
```

---

## Usage Examples

### Migration Commands

```bash
# Dry run to preview
python migrate_redis_to_mongodb.py --dry-run

# Full migration
python migrate_redis_to_mongodb.py

# With custom connection strings
python migrate_redis_to_mongodb.py \
  --redis-url redis://localhost:6379/0 \
  --mongo-uri mongodb://localhost:27017/audiobot

# Only verify without migrating
python migrate_redis_to_mongodb.py --verify-only
```

### Verification Commands

```bash
# Quick status check
python verify_migration.py

# With integrity validation
python verify_migration.py --check-integrity

# Export results as JSON
python verify_migration.py --json > migration_report.json

# Export results as CSV
python verify_migration.py --export migration_report.csv

# Full detailed report with integrity check
python verify_migration.py --check-integrity --export full_report.csv
```

---

## Understanding the Output

### Migration Output Example

```
2024-03-30 10:15:42,123 - INFO - 🚀 Starting Redis to MongoDB migration...

2024-03-30 10:15:43,456 - INFO - 📋 Found 2345 conversation IDs in Redis
2024-03-30 10:15:44,789 - INFO - ✅ Retrieved 2345 conversations from Redis
2024-03-30 10:15:45,012 - INFO - ⏳ Processed 10/2345 conversations
...
2024-03-30 10:16:50,345 - INFO - 
============================================================
✅ Migration complete!
   Migrated: 2345
   Failed: 2
============================================================
```

### Verification Output Example

```
======================================================================
  REDIS TO MONGODB MIGRATION VERIFICATION REPORT
======================================================================

📅 Generated: 2024-03-30T10:17:30.123456

📊 OVERVIEW
----------------------------------------------------------------------
  Total in Redis:   2345
  Total in MongoDB: 2347
  Synchronized:     2345
  Only in Redis:    0
  Only in MongoDB:  2

  Status: ✅ COMPLETE
```

---

## MongoDB Schema

The migration creates documents in the `conversations` collection:

```javascript
{
  _id: ObjectId(...),
  sessionId: "uuid-string",
  userId: ObjectId(...),              // optional, from Node gateway
  messages: [
    {
      role: "user|assistant",
      content: "message text",
      type: "text|audio",
      timestamp: ISODate(...),
      // ... other fields
    }
  ],
  lastUpdated: ISODate(...),
  source: "redis_migration|python_backend|node_gateway",
  migratedAt: ISODate(...),
  createdAt: ISODate(...),            // from Node gateway
  updatedAt: ISODate(...)
}
```

---

## Architecture Changes in Memory Store

### Before
```python
# Only Redis, message loss after TTL
redis.setex(conversation_id, ttl_seconds, json.dumps(messages))
```

### After
```python
# Dual-layer: Cache + Persistent Storage
redis.setex(conversation_id, ttl_seconds, json.dumps(messages))  # Cache
mongodb.conversations.update_one({...}, upsert=True)             # Persistent
```

### Retrieval Strategy
1. Try Redis first (fast, cache hit)
2. If miss, check MongoDB
3. Rehydrate to Redis for next access

---

## Troubleshooting

### "Failed to connect to Redis"
- Verify Redis is running
- Check `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` env variables
- Test with: `redis-cli ping`

### "Failed to connect to MongoDB"
- Verify MongoDB is running
- Check `MONGODB_URI` env variable
- Test with: `mongo --eval "db.adminCommand('ping')"`

### "Connection timeout"
- Firewall blocking connections
- MongoDB/Redis not accessible from your network
- Use explicit addresses instead of localhost

### Migration Hangs
- Large number of conversations (>10k)
- Slow MongoDB inserts
- Network issues
- Kill with Ctrl+C and check logs

### Verify Shows Mismatches
- Run migration again (safe, uses upsert)
- Check MongoDB for duplicates
- Verify data wasn't added between migration and verification

---

## Monitoring

### Check Migration Status

```python
from app.memory.store import MemoryStore

store = MemoryStore()
stats = store.get_stats()
print(stats)
# Output: {'redis_count': 100, 'mongodb_count': 100, 'persistence_enabled': True}
```

### View Conversation in Both Stores

```bash
# Check Redis
redis-cli GET "conversation-uuid"

# Check MongoDB
mongo audiobot --eval 'db.conversations.findOne({sessionId: "conversation-uuid"})'
```

---

## Performance Notes

- **Migration Speed**: ~100 conversations/minute on typical hardware
- **Batch Size**: Script processes 100 conversations per batch
- **MongoDB Impact**: Upsert operations add minimal load
- **Redis TTL**: Still honored for performance (doesn't affect persistence)

---

## Safety & Rollback

The migration is **safe**:
- Dry-run mode to preview before committing
- Uses MongoDB upsert (won't overwrite existing data)
- Verification before declaring success
- Can be run multiple times

**No rollback needed** - MongoDB stores permanent copies, Redis still works normally.

---

## Post-Migration Tasks

1. ✅ Run verification script to confirm success
2. ✅ Monitor application logs for any issues
3. ✅ Update memory store configuration if needed
4. ✅ Consider Redis TTL policy if you have one
5. ✅ Archive CSV reports for audit trail

---

## Support

For issues or questions:
1. Check logs from migration/verification scripts
2. Verify MongoDB/Redis connectivity
3. Run `--dry-run` to isolate the issue
4. Export detailed reports with `--export` flag

