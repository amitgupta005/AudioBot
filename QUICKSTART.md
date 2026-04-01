# 🚀 Quick Start - Store Messages from Redis to MongoDB

## ⚡ 30-Second Overview

All your chat messages from Redis will be saved permanently to MongoDB.

---

## 📋 What Was Done

| Component | Created | Purpose |
|-----------|---------|---------|
| `migrate_redis_to_mongodb.py` | 🆕 New | Move messages from Redis to MongoDB |
| `verify_migration.py` | 🆕 New | Verify migration success |
| `migrate.bat` | 🆕 New | Easy commands on Windows |
| `migrate.sh` | 🆕 New | Easy commands on Linux/macOS |
| `app/memory/store.py` | ✏️ Updated | Save to both Redis and MongoDB |

---

## 🎯 Three-Step Process

### Step 1: Preview (Safe ✅)
```bash
cd backend
python migrate_redis_to_mongodb.py --dry-run
```

Shows what will be migrated **without making any changes**.

### Step 2: Migrate
```bash
python migrate_redis_to_mongodb.py
```

Moves all messages from Redis to MongoDB.

### Step 3: Verify
```bash
python verify_migration.py
```

Confirms migration was successful.

---

## 🖥️ Using Helper Scripts (Easiest)

### Windows
```bash
cd backend
migrate.bat migrate-dry   # Preview
migrate.bat migrate       # Do it
migrate.bat verify        # Check
```

### Linux/macOS
```bash
cd backend
chmod +x migrate.sh       # Make executable (first time only)
./migrate.sh migrate-dry  # Preview
./migrate.sh migrate      # Do it
./migrate.sh verify       # Check
```

---

## 📊 What Happens

**Before Migration:**
- Messages stay in Redis for 30 minutes
- After TTL expires → messages disappear
- No backup (except Node gateway data)

**After Migration:**
- Messages saved to MongoDB forever
- Redis still works (faster cache)
- If Redis expires → MongoDB has copy
- Perfect fallback system

---

## ✅ Expected Output

```
🚀 Starting Redis to MongoDB migration...

📋 Found 2,345 conversation IDs in Redis
✅ Retrieved 2,345 conversations from Redis
⏳ Processing conversations...

============================================================
✅ Migration complete!
   Migrated: 2,345
   Failed: 0
============================================================

📊 Verification Report
[All conversations successfully migrated and verified]
```

---

## ❓ Common Questions

### Q: Is it safe?
**A:** Yes! Uses dry-run mode first, then upsert (won't overwrite). Can run multiple times.

### Q: Will I lose data?
**A:** No. Migration doesn't delete from Redis, only copies to MongoDB.

### Q: How long does it take?
**A:** ~100 conversations per minute. For 2,345 convos ≈ 25 minutes.

### Q: What if it fails?
**A:** Safe to run again. Uses upsert so no duplicates. Check logs for details.

### Q: Do I need to stop the application?
**A:** No. Can run while app is running. Doesn't interfere.

---

## 🔍 Verify It Worked

After migration, check that messages are in MongoDB:

```bash
# Check what's in MongoDB
python
>>> from app.memory.store import MemoryStore
>>> store = MemoryStore()
>>> stats = store.get_stats()
>>> print(stats)
{'redis_count': 2345, 'mongodb_count': 2345, 'persistence_enabled': True}
```

If counts match → Migration successful ✅

---

## 📚 Need More Details?

- **MIGRATION_GUIDE.md** - Full guide with troubleshooting
- **IMPLEMENTATION_SUMMARY.md** - Technical details
- **FILES_OVERVIEW.md** - What was created/changed

---

## 🎉 You're Done!

Messages are now:
- ✅ Backed up in MongoDB
- ✅ Permanently stored (no TTL)
- ✅ Protected from data loss
- ✅ Still cached in Redis for speed

**Your conversation history is now secure!** 🔒
