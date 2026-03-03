const Redis = require('ioredis');
const config = require('./index');

let client = null;
const memStore = new Map();
const memTTL = new Map();

const getClient = () => {
  if (client) return client;
  client = new Redis(config.redis.url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 300, 1000)),
  });
  client.on('connect', () => console.log('✅ Redis connected'));
  client.on('error', (e) => console.warn('⚠️  Redis:', e.message));
  return client;
};

const isReady = () => {
  try { return getClient().status === 'ready'; } catch { return false; }
};

const redis = {
  async connect() {
    try { await getClient().connect(); } catch {}
  },

  async get(key) {
    if (isReady()) return getClient().get(key);
    const exp = memTTL.get(key);
    if (exp && Date.now() > exp) { memStore.delete(key); memTTL.delete(key); return null; }
    return memStore.get(key) ?? null;
  },

  async set(key, value, exMode, ttl) {
    if (isReady()) {
      return exMode === 'EX' ? getClient().set(key, value, 'EX', ttl) : getClient().set(key, value);
    }
    memStore.set(key, value);
    if (exMode === 'EX') memTTL.set(key, Date.now() + ttl * 1000);
    return 'OK';
  },

  async del(key) {
    if (isReady()) return getClient().del(key);
    memStore.delete(key); memTTL.delete(key);
    return 1;
  },

  async keys(pattern) {
    if (isReady()) return getClient().keys(pattern);
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...memStore.keys()].filter(k => regex.test(k));
  },

  async expire(key, ttl) {
    if (isReady()) return getClient().expire(key, ttl);
    memTTL.set(key, Date.now() + ttl * 1000);
    return 1;
  },

  async hset(key, field, value) {
    if (isReady()) return getClient().hset(key, field, value);
    const obj = JSON.parse(memStore.get(key) || '{}');
    obj[field] = value; memStore.set(key, JSON.stringify(obj));
    return 1;
  },

  async hgetall(key) {
    if (isReady()) return getClient().hgetall(key);
    const raw = memStore.get(key);
    return raw ? JSON.parse(raw) : null;
  },

  async incr(key) {
    if (isReady()) return getClient().incr(key);
    const val = parseInt(memStore.get(key) || '0') + 1;
    memStore.set(key, String(val)); return val;
  },

  // Stats helper
  async dbSize() {
    if (isReady()) return getClient().dbsize();
    return memStore.size;
  },
};

module.exports = redis;
