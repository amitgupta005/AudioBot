const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Job = require('../models/Job');
const SystemConfig = require('../models/SystemConfig');
const SessionService = require('../services/sessionService');
const ConversationService = require('../services/conversationService');
const redis = require('../config/redis');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [userStats, convoStats, sessionStats] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            banned: { $sum: { $cond: ['$isBanned', 1, 0] } },
            admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
          },
        },
      ]),
      ConversationService.getStats(),
      SessionService.getStats(),
    ]);

    const todayUsers = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    });

    res.json({
      success: true,
      stats: {
        users: { ...(userStats[0] || { total: 0, active: 0, banned: 0, admins: 0 }), newToday: todayUsers },
        conversations: convoStats,
        sessions: sessionStats,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── USERS ────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const query = {};
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isActive = true, query.isBanned = false;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.json({ success: true, users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create a new user (e.g., company account)
router.post(
  '/users',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().isIn(['user', 'company', 'admin']).withMessage('Invalid role'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { name, email, password, role } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

      const user = await User.create({ name, email, password, role: role || 'company' });
      res.status(201).json({ success: true, user: user.toSafeObject() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const conversations = await ConversationService.getUserConversations(user._id, 1, 5);
    const activeSessions = await SessionService.getUserActiveSessions(user._id);
    res.json({ success: true, user, conversations: conversations.conversations, activeSessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Ban a user
router.post('/users/:id/ban', [body('reason').optional().isString()], async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot ban yourself' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: req.body.reason || 'Banned by admin' },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // End all their active Redis sessions
    const sessions = await SessionService.getUserActiveSessions(user._id);
    await Promise.all(sessions.map((s) => SessionService.end(s.sessionId)));

    res.json({ success: true, message: `User ${user.email} banned`, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Unban a user
router.post('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, banReason: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: `User ${user.email} unbanned`, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const sessions = await SessionService.getUserActiveSessions(user._id);
    await Promise.all(sessions.map((s) => SessionService.end(s.sessionId)));

    res.json({ success: true, message: `User ${user.email} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, companyId, jobId, isActive, search } = req.query;
    const filters = {};
    if (userId) filters.userId = userId;
    if (companyId) filters.companyId = companyId;
    if (jobId) filters.jobId = jobId;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (search) filters.search = search;

    const result = await ConversationService.getAllConversations(Number(page), Number(limit), filters);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/conversations/:sessionId', async (req, res) => {
  try {
    const convo = await ConversationService.getConversationDetails(req.params.sessionId);
    if (!convo) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, conversation: convo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── JOBS ─────────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const { companyId } = req.query;
    const query = {};
    if (companyId) query.companyId = companyId;
    const jobs = await Job.find(query).sort({ createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/jobs/:jobId/conversations', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const result = await ConversationService.getConversationsByJobId(job._id, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin force-end a session
router.post('/conversations/:sessionId/end', async (req, res) => {
  try {
    const [session, convo] = await Promise.all([
      SessionService.end(req.params.sessionId),
      ConversationService.endSession(req.params.sessionId, 'admin'),
    ]);
    res.json({ success: true, message: 'Session force-ended by admin', sessionId: req.params.sessionId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ACTIVE SESSIONS ─────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await SessionService.getAllActiveSessions();
    res.json({ success: true, sessions, total: sessions.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await Promise.all([
      SessionService.end(req.params.sessionId),
      ConversationService.endSession(req.params.sessionId, 'admin'),
    ]);
    res.json({ success: true, message: 'Session terminated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SYSTEM CONFIG ────────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const configs = await SystemConfig.find().sort({ key: 1 });
    res.json({ success: true, configs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    const results = await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        SystemConfig.set(key, value, '', req.user._id)
      )
    );
    res.json({ success: true, message: 'Config updated', configs: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
