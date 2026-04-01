const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const SystemConfig = require('../models/SystemConfig');
const sessionService = require('../services/session.service');
const redis = require('../config/redis');
const mongoose = require('mongoose');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      totalConversations,
      activeConversations,
      sessionStats,
      redisDbSize,
      totalMessages,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Conversation.countDocuments(),
      Conversation.countDocuments({ isActive: true }),
      sessionService.getStats(),
      redis.dbSize(),
      Conversation.aggregate([{ $group: { _id: null, total: { $sum: '$messageCount' } } }]),
    ]);

    // New users last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });

    // Activity chart (last 7 days)
    const activityData = await Conversation.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, active: activeUsers, banned: bannedUsers, newThisWeek: newUsersThisWeek },
        conversations: {
          total: totalConversations,
          active: activeConversations,
          totalMessages: totalMessages[0]?.total || 0,
        },
        sessions: { active: sessionStats.redis?.active ?? sessionStats.active ?? 0, total: sessionStats.redis?.total ?? sessionStats.total ?? 0, ended: sessionStats.redis?.ended ?? sessionStats.ended ?? 0, redisKeys: sessionStats.redis?.keys ?? sessionStats.redisKeys ?? 0, mongoTotal: sessionStats.mongodb?.total ?? 0 },
        redis: { dbSize: redisDbSize },
        activityChart: activityData,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── USERS MANAGEMENT ─────────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const query = {};
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    else if (status === 'active') { query.isActive = true; query.isBanned = false; }
    else if (status === 'inactive') query.isActive = false;

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.json({ success: true, users, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const conversations = await Conversation.find({ userId: req.params.id })
      .sort({ createdAt: -1 }).limit(10).select('-messages');

    const activeSessions = await sessionService.getUserSessions(req.params.id);

    res.json({ success: true, user, conversations, activeSessions });
  } catch (err) {
    next(err);
  }
});

// Ban a user
router.patch('/users/:id/ban', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot ban admin users' });

    user.isBanned = true;
    user.bannedReason = reason || 'Policy violation';
    await user.save();

    // End all active sessions
    const sessions = await sessionService.getUserSessions(req.params.id);
    await Promise.all(sessions.map(s => sessionService.forceEnd(s.sessionId)));

    res.json({ success: true, message: 'User banned', user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
});

// Unban a user
router.patch('/users/:id/unban', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, bannedReason: '' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User unbanned', user });
  } catch (err) {
    next(err);
  }
});

// Delete a user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot delete admin users' });

    // End all sessions
    const sessions = await sessionService.getUserSessions(req.params.id);
    await Promise.all(sessions.map(s => sessionService.forceEnd(s.sessionId)));

    await Conversation.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User and all associated data deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── CONVERSATIONS ─────────────────────────────────────────────────────────────
router.get('/conversations', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, userId, active } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (active === 'true') query.isActive = true;
    else if (active === 'false') query.isActive = false;

    const [conversations, total] = await Promise.all([
      Conversation.find(query).populate('userId', 'name email').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(parseInt(limit)).select('-messages'),
      Conversation.countDocuments(query),
    ]);

    res.json({ success: true, conversations, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:sessionId', async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({ sessionId: req.params.sessionId })
      .populate('userId', 'name email');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

// ─── JOBS & CONVERSATIONS ──────────────────────────────────────────────────────
router.get('/jobs/:jobId/conversations', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { page = 1, limit = 20, active } = req.query;
    
    const query = { jobId };
    if (active === 'true') query.isActive = true;
    else if (active === 'false') query.isActive = false;

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('-messages'),
      Conversation.countDocuments(query),
    ]);

    res.json({ 
      success: true, 
      conversations, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit), 
      jobId 
    });
  } catch (err) {
    next(err);
  }
});

// ─── SESSION MANAGEMENT ────────────────────────────────────────────────────────
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await sessionService.getAllActiveSessions();

    // Enrich with user info
    const enriched = await Promise.all(
      sessions.map(async (s) => {
        const user = await User.findById(s.userId).select('name email').lean();
        return { ...s, user };
      })
    );

    res.json({ success: true, sessions: enriched, count: enriched.length });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    const ended = await sessionService.forceEnd(req.params.sessionId);
    if (!ended) return res.status(404).json({ success: false, message: 'Session not found or already ended' });

    await Conversation.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      { isActive: false, endedAt: new Date(), endedBy: 'admin' }
    );

    res.json({ success: true, message: 'Session ended by admin' });
  } catch (err) {
    next(err);
  }
});

// End all sessions for a user
router.delete('/sessions/user/:userId', async (req, res, next) => {
  try {
    const sessions = await sessionService.getUserSessions(req.params.userId);
    await Promise.all(sessions.map(s => sessionService.forceEnd(s.sessionId)));
    await Conversation.updateMany(
      { userId: req.params.userId, isActive: true },
      { isActive: false, endedAt: new Date(), endedBy: 'admin' }
    );
    res.json({ success: true, message: `${sessions.length} sessions ended`, count: sessions.length });
  } catch (err) {
    next(err);
  }
});

// ─── SYSTEM CONFIG ─────────────────────────────────────────────────────────────
router.get('/config', async (req, res, next) => {
  try {
    const configs = await SystemConfig.find().populate('updatedBy', 'name email').sort({ key: 1 });
    res.json({ success: true, configs });
  } catch (err) {
    next(err);
  }
});

router.put('/config/:key', async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: 'value is required' });

    const config = await SystemConfig.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedBy: req.user._id },
      { new: true, upsert: true }
    ).populate('updatedBy', 'name email');

    res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
});

// ─── CONVERSATION REPORTS ──────────────────────────────────────────────────────
router.post('/conversation/:conversationId/report.pdf', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Call FastAPI backend to generate/retrieve the PDF
    const fastApiUrl = process.env.FASTAPI_BACKEND_URL || 'http://localhost:8000';
    const fetch = (await import('node-fetch')).default;

    const backendResponse = await fetch(`${fastApiUrl}/admin/conversation/${conversation.sessionId}/report.pdf`, {
      method: 'POST',
    });

    if (!backendResponse.ok) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate report from backend'
      });
    }

    // The Python backend responds with a JSON containing the already uploaded Cloudinary URL
    const data = await backendResponse.json();
    
    if (!data.success || !data.report_url) {
      return res.status(500).json({
        success: false,
        message: 'Backend failed to generate report URL'
      });
    }

    // Store the report URL and metadata in MongoDB
    const reportData = {
      pdfUrl: data.report_url,
      uploadedAt: new Date(),
      generatedAt: new Date(),
    };

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { report: reportData },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Report uploaded successfully',
      report: reportData,
      conversation: updatedConversation,
    });
  } catch (err) {
    next(err);
  }
});

// Get report for a conversation
router.get('/conversation/:conversationId/report', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId).select('report title sessionId');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.report || !conversation.report.pdfUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'No report available for this conversation' 
      });
    }

    res.json({
      success: true,
      report: conversation.report,
      conversationTitle: conversation.title,
      sessionId: conversation.sessionId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
