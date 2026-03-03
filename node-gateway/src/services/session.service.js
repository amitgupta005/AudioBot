const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');
const config = require('../config');

// Lazy-load Conversation model to avoid circular deps
const getConversation = () => require('../models/Conversation');

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

const sessionService = {

  // ── Create: write to BOTH Redis (hot) and MongoDB (persistent) ──────────────
  async create(userId) {
    const sessionId = uuidv4();
    const now = new Date();
    const sessionData = {
      sessionId,
      userId: userId.toString(),
      createdAt: now.toISOString(),
      lastActivity: now.toISOString(),
      messageCount: 0,
      isActive: true,
    };

    // 1. Write to Redis (fast, hot cache)
    await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(sessionData), 'EX', config.redis.sessionTTL);

    // Track session IDs under user key
    const userKey = USER_SESSIONS_PREFIX + userId;
    let sessions = [];
    try {
      const existing = await redis.get(userKey);
      sessions = existing ? JSON.parse(existing) : [];
    } catch {}
    sessions.push(sessionId);
    await redis.set(userKey, JSON.stringify(sessions), 'EX', config.redis.sessionTTL * 2);

    // 2. Write skeleton to MongoDB immediately (so it always exists there)
    try {
      const Conversation = getConversation();
      await Conversation.findOneAndUpdate(
        { sessionId },
        {
          $setOnInsert: {
            sessionId,
            userId,
            isActive: true,
            createdAt: now,
            messages: [],
            messageCount: 0,
          }
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('⚠️  MongoDB session create failed:', err.message);
      // Don't throw — Redis session still works
    }

    return sessionId;
  },

  // ── Get: Redis first, fall back to MongoDB ───────────────────────────────────
  async get(sessionId) {
    // Try Redis first (fast)
    try {
      const raw = await redis.get(SESSION_PREFIX + sessionId);
      if (raw) return JSON.parse(raw);
    } catch {}

    // Fall back to MongoDB (when Redis TTL has expired)
    try {
      const Conversation = getConversation();
      const conv = await Conversation.findOne({ sessionId }).select('sessionId userId isActive createdAt endedAt messageCount').lean();
      if (!conv) return null;

      // Rehydrate into Redis so subsequent calls are fast again
      const sessionData = {
        sessionId: conv.sessionId,
        userId: conv.userId.toString(),
        createdAt: conv.createdAt.toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: conv.messageCount || 0,
        isActive: conv.isActive,
      };
      await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(sessionData), 'EX', config.redis.sessionTTL);
      return sessionData;
    } catch (err) {
      console.error('⚠️  MongoDB session get failed:', err.message);
      return null;
    }
  },

  // ── Touch: update activity in Redis AND sync count to MongoDB ────────────────
  async touch(sessionId) {
    const session = await this.get(sessionId);
    if (!session) return false;

    session.lastActivity = new Date().toISOString();
    session.messageCount = (session.messageCount || 0) + 1;

    // Update Redis
    await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(session), 'EX', config.redis.sessionTTL);

    // Sync message count to MongoDB
    try {
      const Conversation = getConversation();
      await Conversation.findOneAndUpdate(
        { sessionId },
        { $set: { messageCount: session.messageCount, lastActivity: new Date() } }
      );
    } catch {}

    return true;
  },

  // ── End: mark ended in BOTH Redis and MongoDB ────────────────────────────────
  async end(sessionId, endedBy = 'user') {
    const session = await this.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    session.endedAt = new Date().toISOString();
    session.endedBy = endedBy;

    // Keep in Redis briefly for audit reads, then expire
    await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(session), 'EX', 300);

    // Persist end state to MongoDB permanently
    try {
      const Conversation = getConversation();
      await Conversation.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            isActive: false,
            endedAt: new Date(),
            endedBy,
            messageCount: session.messageCount || 0,
          }
        }
      );
    } catch (err) {
      console.error('⚠️  MongoDB session end failed:', err.message);
    }

    return session;
  },

  async forceEnd(sessionId) {
    return this.end(sessionId, 'admin');
  },

  // ── Get all active sessions for a user (Redis + MongoDB fallback) ─────────────
  async getUserSessions(userId) {
    // Try Redis first
    try {
      const raw = await redis.get(USER_SESSIONS_PREFIX + userId);
      if (raw) {
        const ids = JSON.parse(raw);
        const sessions = await Promise.all(ids.map(id => this.get(id)));
        return sessions.filter(s => s && s.isActive);
      }
    } catch {}

    // Fall back to MongoDB
    try {
      const Conversation = getConversation();
      const convs = await Conversation.find({ userId, isActive: true }).select('sessionId userId createdAt messageCount isActive').lean();
      return convs.map(c => ({
        sessionId: c.sessionId,
        userId: c.userId.toString(),
        createdAt: c.createdAt.toISOString(),
        lastActivity: c.createdAt.toISOString(),
        messageCount: c.messageCount || 0,
        isActive: true,
      }));
    } catch {
      return [];
    }
  },

  // ── All active sessions (admin) ───────────────────────────────────────────────
  async getAllActiveSessions() {
    const keys = await redis.keys(SESSION_PREFIX + '*');
    const redisSessions = (await Promise.all(
      keys.map(async key => {
        try {
          const raw = await redis.get(key);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })
    )).filter(s => s && s.isActive);

    // Also get any active sessions only in MongoDB (Redis expired)
    try {
      const Conversation = getConversation();
      const redisIds = new Set(redisSessions.map(s => s.sessionId));
      const mongoOnly = await Conversation.find({ isActive: true }).select('sessionId userId createdAt messageCount').lean();
      mongoOnly.forEach(c => {
        if (!redisIds.has(c.sessionId)) {
          redisSessions.push({
            sessionId: c.sessionId,
            userId: c.userId.toString(),
            createdAt: c.createdAt.toISOString(),
            lastActivity: c.createdAt.toISOString(),
            messageCount: c.messageCount || 0,
            isActive: true,
            source: 'mongodb',
          });
        }
      });
    } catch {}

    return redisSessions;
  },

  async countActive() {
    const sessions = await this.getAllActiveSessions();
    return sessions.length;
  },

  async getStats() {
    const allKeys = await redis.keys(SESSION_PREFIX + '*');
    const all = (await Promise.all(
      allKeys.map(async key => {
        try { const raw = await redis.get(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
      })
    )).filter(Boolean);

    const active = all.filter(s => s.isActive);

    // MongoDB totals
    let mongoTotal = 0, mongoActive = 0;
    try {
      const Conversation = getConversation();
      mongoTotal = await Conversation.countDocuments();
      mongoActive = await Conversation.countDocuments({ isActive: true });
    } catch {}

    return {
      redis: { total: all.length, active: active.length, ended: all.length - active.length, keys: allKeys.length },
      mongodb: { total: mongoTotal, active: mongoActive },
    };
  },
};

module.exports = sessionService;
