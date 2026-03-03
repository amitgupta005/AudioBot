const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');
const config = require('../config');

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

const sessionService = {
  // Create a new session for a user
  async create(userId) {
    const sessionId = uuidv4();
    const sessionData = {
      sessionId,
      userId: userId.toString(),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      isActive: true,
    };

    const key = SESSION_PREFIX + sessionId;
    await redis.set(key, JSON.stringify(sessionData), 'EX', config.redis.sessionTTL);

    // Track session under user
    const userKey = USER_SESSIONS_PREFIX + userId;
    const existingSessions = await redis.get(userKey);
    const sessions = existingSessions ? JSON.parse(existingSessions) : [];
    sessions.push(sessionId);
    await redis.set(userKey, JSON.stringify(sessions), 'EX', config.redis.sessionTTL * 2);

    return sessionId;
  },

  // Get session data
  async get(sessionId) {
    const raw = await redis.get(SESSION_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : null;
  },

  // Update session activity
  async touch(sessionId) {
    const session = await this.get(sessionId);
    if (!session) return false;
    session.lastActivity = new Date().toISOString();
    session.messageCount = (session.messageCount || 0) + 1;
    await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(session), 'EX', config.redis.sessionTTL);
    return true;
  },

  // End a session
  async end(sessionId, endedBy = 'user') {
    const session = await this.get(sessionId);
    if (!session) return false;
    session.isActive = false;
    session.endedAt = new Date().toISOString();
    session.endedBy = endedBy;
    // Store ended state briefly for audit then expire
    await redis.set(SESSION_PREFIX + sessionId, JSON.stringify(session), 'EX', 300);
    return session;
  },

  // Force-end a session (admin)
  async forceEnd(sessionId) {
    return this.end(sessionId, 'admin');
  },

  // Get all active sessions for a user
  async getUserSessions(userId) {
    const raw = await redis.get(USER_SESSIONS_PREFIX + userId);
    if (!raw) return [];
    const sessionIds = JSON.parse(raw);
    const sessions = await Promise.all(
      sessionIds.map(id => this.get(id))
    );
    return sessions.filter(s => s && s.isActive);
  },

  // Get all active sessions (admin)
  async getAllActiveSessions() {
    const keys = await redis.keys(SESSION_PREFIX + '*');
    const sessions = await Promise.all(
      keys.map(async key => {
        const raw = await redis.get(key);
        return raw ? JSON.parse(raw) : null;
      })
    );
    return sessions.filter(s => s && s.isActive);
  },

  // Count active sessions
  async countActive() {
    const sessions = await this.getAllActiveSessions();
    return sessions.length;
  },

  // Stats
  async getStats() {
    const allKeys = await redis.keys(SESSION_PREFIX + '*');
    const all = await Promise.all(
      allKeys.map(async key => {
        const raw = await redis.get(key);
        return raw ? JSON.parse(raw) : null;
      })
    );
    const valid = all.filter(Boolean);
    const active = valid.filter(s => s.isActive);

    return {
      total: valid.length,
      active: active.length,
      ended: valid.length - active.length,
      redisKeys: allKeys.length,
    };
  },
};

module.exports = sessionService;
