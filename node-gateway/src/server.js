require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const connectMongoDB = require('./config/mongodb');
const redis = require('./config/redis');
const setupWebSocketProxy = require('./services/ws-proxy.service');
const SystemConfig = require('./models/SystemConfig');
const User = require('./models/User');

const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();
const server = http.createServer(app);

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.cors.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many requests' } }));
app.use('/api/chat', rateLimit({ windowMs: 1 * 60 * 1000, max: 60 }));
app.use('/api/admin', rateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// ─── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'audiobot-gateway',
  timestamp: new Date().toISOString(),
}));

app.use(notFound);
app.use(errorHandler);

// ─── STARTUP ───────────────────────────────────────────────────────────────────
const start = async () => {
  await connectMongoDB();
  await redis.connect();

  // Seed defaults
  await SystemConfig.seedDefaults();
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    await User.create({
      name: config.admin.name,
      email: config.admin.email,
      password: config.admin.password,
      role: 'admin',
    });
    console.log(`✅ Admin user seeded: ${config.admin.email}`);
  }

  // Setup WebSocket proxy
  setupWebSocketProxy(server);

  server.listen(config.port, () => {
    console.log(`\n🚀 AudioBot Gateway running on http://localhost:${config.port}`);
    console.log(`   FastAPI backend: ${config.fastapi.url}`);
    console.log(`   MongoDB: ${config.mongodb.uri}`);
    console.log(`   Redis: ${config.redis.url}`);
    console.log(`   WS Proxy: ws://localhost:${config.port}/ws\n`);
  });
};

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
