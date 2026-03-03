const redis = require('../config/redis');
const config = require('../config');

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

const SessionService = {
  sessionKey: (sessionId) => `${SESSION_PREFIX}${sessionId}`,
  userSessionsKey: (userId) => `${USER_SESSIONS_PREFIX}${userId}`,

  async create(sessionId, userId, metadata = {}) {
    const session = {
      sessionId,
      userId: userId.toString(),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [], // short-term context buffer (last N messages)
      metadata,
    };
    await redis.set(this.sessionKey(sessionId), JSON.stringify(session), 'EX', config.redis.sessionTTL);

    // Track this session under the user
    const userSessions = await this.getUserSessionIds(userId);
    userSessions.push(sessionId);
    await redis.set(this.userSessionsKey(userId), JSON.stringify(userSessions), 'EX', config.redis.sessionTTL * 10);

    return session;
  },

  async get(sessionId) {
    const raw = await redis.get(this.sessionKey(sessionId));
    return raw ? JSON.parse(raw) : null;
  },

  async update(sessionId, updates) {
    const session = await this.get(sessionId);
    if (!session) return null;
    const updated = { ...session, ...updates, lastActivity: new Date().toISOString() };
    await redis.set(this.sessionKey(sessionId), JSON.stringify(updated), 'EX', config.redis.sessionTTL);
    return updated;
  },

  async appendMessage(sessionId, message) {
    const session = await this.get(sessionId);
    if (!session) return null;
    const MAX_CONTEXT = 20; // keep last 20 messages in Redis for context
    const messages = [...(session.messages || []), message].slice(-MAX_CONTEXT);
    return this.update(sessionId, { messages });
  },

  async end(sessionId) {
    const session = await this.get(sessionId);
    await redis.del(this.sessionKey(sessionId));
    return session;
  },

  async getUserSessionIds(userId) {
    const raw = await redis.get(this.userSessionsKey(userId));
    return raw ? JSON.parse(raw) : [];
  },

  async getUserActiveSessions(userId) {
    const ids = await this.getUserSessionIds(userId);
    const sessions = await Promise.all(ids.map((id) => this.get(id)));
    return sessions.filter(Boolean);
  },

  async getAllActiveSessions() {
    const keys = await redis.keys(`${SESSION_PREFIX}*`);
    const sessions = await Promise.all(
      keys.map(async (k) => {
        const raw = await redis.get(k);
        return raw ? JSON.parse(raw) : null;
      })
    );
    return sessions.filter(Boolean);
  },

  async getStats() {
    const keys = await redis.keys(`${SESSION_PREFIX}*`);
    return {
      activeSessions: keys.length,
      redisConnected: redis.isConnected(),
      totalRedisKeys: await redis.dbsize(),
    };
  },
};

module.exports = SessionService;
