require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');

const config = require('./config');
const connectMongoDB = require('./config/mongodb');
const redis = require('./config/redis');
const setupWebSocketProxy = require('./services/ws-proxy.service');
const SystemConfig = require('./models/SystemConfig');
const User = require('./models/User');
const axios = require('axios');
const FormData = require('form-data');

const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const { authenticate, requireAdmin } = require('./middleware/auth.middleware');
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
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many requests' } }));
app.use('/api/chat', rateLimit({ windowMs: 1 * 60 * 1000, max: 60 }));
app.use('/api/admin', rateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// ─── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

app.post('/api/upload-jd', authenticate, async (req, res, next) => {
  try {
    if (!req.files || !req.files.jd) {
      return res.status(400).json({ success: false, message: 'JD file is required' });
    }

    if (!req.body.session_id) {
      return res.status(400).json({ success: false, message: 'session_id is required' });
    }

    const jdFile = req.files.jd;
    const forwardForm = new FormData();
    forwardForm.append('jd', jdFile.data, { filename: jdFile.name, contentType: jdFile.mimetype });
    forwardForm.append('session_id', req.body.session_id);

    const response = await axios.post(`${config.fastapi.url}/api/upload-jd`, forwardForm, {
      headers: {
        ...forwardForm.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

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
