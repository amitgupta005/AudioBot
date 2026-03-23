require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const connectMongoDB = require('./config/mongodb');
const redis = require('./config/redis');
const { authenticate } = require('./middleware/auth');
const { createFastapiProxy, setupWebSocketProxy } = require('./middleware/proxy');

const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const adminRoutes = require('./routes/admin');
const companyRoutes = require('./routes/company');

const app = express();
const server = http.createServer(app);

// ─── Security & Middleware ────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.cors.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'audiobot-middleware',
    timestamp: new Date().toISOString(),
    redis: redis.isConnected() ? 'connected' : 'fallback',
  });
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Conversation Routes (authenticated) ─────────────────────────────────────
app.use('/api/conversations', conversationRoutes);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.use('/api/admin', adminRoutes);

// ─── Company Routes ───────────────────────────────────────────────────────────
app.use('/api/company', companyRoutes);

// ─── FastAPI Proxy (authenticated) ───────────────────────────────────────────
// Injects session context, validates JWT, then proxies to FastAPI
app.use('/api/ai', authenticate, (req, res, next) => {
  // Attach session header from query/body if provided
  req.sessionId = req.query.session || req.body?.session_id;
  next();
}, createFastapiProxy());

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` }));

// ─── Start ────────────────────────────────────────────────────────────────────
const start = async () => {
  await connectMongoDB();
  await redis.connect();
  setupWebSocketProxy(server);

  server.listen(config.port, () => {
    console.log(`\n🚀 AudioBot Middleware running on http://localhost:${config.port}`);
    console.log(`   FastAPI target: ${config.fastapiUrl}`);
    console.log(`   Environment:    ${config.nodeEnv}\n`);
  });
};

start();
