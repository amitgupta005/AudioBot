require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',

  fastapi: {
    url: process.env.FASTAPI_URL || 'http://localhost:8000',
    wsUrl: process.env.FASTAPI_WS_URL || 'ws://localhost:8000',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-dev',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/audiobot',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTTL: parseInt(process.env.SESSION_TTL) || 3600,
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@audiobot.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123!',
    name: process.env.ADMIN_NAME || 'Super Admin',
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),
  },
};
