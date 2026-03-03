const express = require('express');
const router = express.Router();
const axios = require('axios').default;
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const sessionService = require('../services/session.service');
const SystemConfig = require('../models/SystemConfig');
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config');

// ── POST /api/chat/session/start ─────────────────────────────────────────────
router.post('/session/start', authenticate, async (req, res, next) => {
  try {
    const greeting = await SystemConfig.get('ai_greeting');

    // sessionService.create() now writes to BOTH Redis and MongoDB
    const sessionId = await sessionService.create(req.user._id);

    // Add greeting message to MongoDB conversation
    await Conversation.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: { role: 'assistant', content: greeting, type: 'text', timestamp: new Date() } },
        $set: { title: 'New Conversation' },
      },
      { new: true }
    );

    await User.findByIdAndUpdate(req.user._id, { $inc: { totalSessions: 1 } });

    console.log(`✅ Session started: ${sessionId} for user ${req.user.email}`);
    res.json({ success: true, sessionId, greeting });
  } catch (err) {
    console.error('❌ session/start error:', err.message);
    next(err);
  }
});

// ── POST /api/chat/message ────────────────────────────────────────────────────
router.post('/message', authenticate, async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ success: false, message: 'message and sessionId are required' });
    }

    // Get session — falls back to MongoDB if Redis TTL expired
    const session = await sessionService.get(sessionId);
    if (!session) {
      return res.status(403).json({ success: false, message: 'Session not found. Please start a new session.' });
    }
    if (session.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Session does not belong to you.' });
    }
    if (!session.isActive) {
      return res.status(400).json({ success: false, message: 'Session has ended. Please start a new session.' });
    }

    // Check message limit
    const maxMessages = await SystemConfig.get('max_session_messages');
    if (session.messageCount >= maxMessages) {
      await sessionService.end(sessionId, 'system');
      return res.status(400).json({ success: false, message: 'Session message limit reached. Please start a new session.' });
    }

    // Get AI config
    const [systemPrompt, groqModel] = await Promise.all([
      SystemConfig.get('system_prompt'),
      SystemConfig.get('groq_model'),
    ]);

    // 1. Save user message to MongoDB BEFORE calling FastAPI
    const userMsg = { role: 'user', content: message, type: 'text', timestamp: new Date() };
    await Conversation.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: userMsg },
        $set: { userId: req.user._id }, // ensure userId is always set
      },
      { upsert: true, new: true }
    );

    // 2. Call FastAPI
    let aiResponseText;
    try {
      const fastapiRes = await axios.post(
        `${config.fastapi.url}/chat`,
        { message, session_id: sessionId, system_prompt: systemPrompt, model: groqModel },
        { timeout: 30000, headers: { 'X-User-ID': req.user._id.toString() } }
      );
      const d = fastapiRes.data;
      aiResponseText = d?.response || d?.text || d?.message || (typeof d === 'string' ? d : JSON.stringify(d));
    } catch (fastapiErr) {
      // On FastAPI failure, save an error message to MongoDB so the conversation isn't broken
      await Conversation.findOneAndUpdate(
        { sessionId },
        { $push: { messages: { role: 'assistant', content: '[AI service unavailable]', type: 'text', timestamp: new Date() } } }
      );
      return res.status(502).json({
        success: false,
        message: 'AI service unavailable',
        detail: fastapiErr.message,
      });
    }

    // 3. Save assistant response to MongoDB
    const assistantMsg = { role: 'assistant', content: aiResponseText, type: 'text', timestamp: new Date() };
    await Conversation.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: assistantMsg },
        $set: { messageCount: (session.messageCount || 0) + 2 },
      }
    );

    // 4. Update Redis session activity + user stats
    await sessionService.touch(sessionId);
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalMessages: 2 } });

    console.log(`💬 Message saved: session=${sessionId} user=${req.user.email}`);
    res.json({
      success: true,
      response: aiResponseText,
      sessionId,
      messageCount: (session.messageCount || 0) + 2,
    });
  } catch (err) {
    console.error('❌ /message error:', err.message);
    next(err);
  }
});

// ── POST /api/chat/session/end ────────────────────────────────────────────────
router.post('/session/end', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });

    const session = await sessionService.get(sessionId);
    if (!session) {
      // Session already gone from Redis — still clean up MongoDB
      await Conversation.findOneAndUpdate(
        { sessionId, userId: req.user._id },
        { isActive: false, endedAt: new Date(), endedBy: 'user' }
      );
      return res.json({ success: true, message: 'Session ended' });
    }
    if (session.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Invalid session' });
    }

    // sessionService.end() now updates both Redis and MongoDB
    await sessionService.end(sessionId, 'user');

    console.log(`🔚 Session ended: ${sessionId}`);
    res.json({ success: true, message: 'Session ended' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/chat/history ─────────────────────────────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [conversations, total] = await Promise.all([
      Conversation.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-messages') // exclude messages for list view
        .lean(),
      Conversation.countDocuments({ userId: req.user._id }),
    ]);

    res.json({ success: true, conversations, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/chat/history/:sessionId ─────────────────────────────────────────
router.get('/history/:sessionId', authenticate, async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      sessionId: req.params.sessionId,
      userId: req.user._id,
    }).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    res.json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
