const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
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
    const { page = 1, limit = 20, userId, isActive, search } = req.query;
    const filters = {};
    if (userId) filters.userId = userId;
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
