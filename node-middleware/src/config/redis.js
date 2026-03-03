const Redis = require('ioredis');
const config = require('./index');

let _client = null;
const _mem = new Map(); // in-memory fallback

const getClient = () => {
  if (_client) return _client;
  _client = new Redis(config.redis.url, {
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : times * 300),
    enableOfflineQueue: false,
  });
  _client.on('connect', () => console.log('✅ Redis connected'));
  _client.on('error', (e) => console.warn('⚠️  Redis error:', e.message));
  return _client;
};

// Try Redis, fall back to in-memory Map
const redis = {
  async connect() {
    try { await getClient().connect(); } catch {}
  },

  async get(key) {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.get(key);
    } catch {}
    return _mem.get(key) ?? null;
  },

  async set(key, value, exFlag, ttl) {
    try {
      const c = getClient();
      if (c.status === 'ready') {
        return exFlag === 'EX'
          ? await c.set(key, value, 'EX', ttl)
          : await c.set(key, value);
      }
    } catch {}
    _mem.set(key, value);
    if (exFlag === 'EX') setTimeout(() => _mem.delete(key), ttl * 1000);
    return 'OK';
  },

  async del(key) {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.del(key);
    } catch {}
    _mem.delete(key);
    return 1;
  },

  async keys(pattern) {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.keys(pattern);
    } catch {}
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [..._mem.keys()].filter((k) => re.test(k));
  },

  async expire(key, ttl) {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.expire(key, ttl);
    } catch {}
    return 1;
  },

  async ttl(key) {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.ttl(key);
    } catch {}
    return -1;
  },

  async dbsize() {
    try {
      const c = getClient();
      if (c.status === 'ready') return await c.dbsize();
    } catch {}
    return _mem.size;
  },

  isConnected() {
    try { return getClient().status === 'ready'; } catch { return false; }
  },

  memFallbackSize() { return _mem.size; },
};

module.exports = redis;
