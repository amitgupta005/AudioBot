const express = require('express');
const router = express.Router();
const axios = require('axios').default;
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const sessionService = require('../services/session.service');
const SystemConfig = require('../models/SystemConfig');
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config');

// POST /api/chat/message - text message
router.post('/message', authenticate, async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ success: false, message: 'message and sessionId are required' });
    }

    // Validate session belongs to user
    const session = await sessionService.get(sessionId);
    if (!session || session.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session' });
    }
    if (!session.isActive) {
      return res.status(400).json({ success: false, message: 'Session has ended' });
    }

    // Check message limit
    const maxMessages = await SystemConfig.get('max_session_messages');
    if (session.messageCount >= maxMessages) {
      await sessionService.end(sessionId, 'system');
      return res.status(400).json({ success: false, message: 'Session message limit reached. Please start a new session.' });
    }

    // Get AI config from MongoDB
    const systemPrompt = await SystemConfig.get('system_prompt');
    const groqModel = await SystemConfig.get('groq_model');

    // Forward to FastAPI
    let aiResponse;
    try {
      const fastapiRes = await axios.post(
        `${config.fastapi.url}/chat`,
        { message, session_id: sessionId, system_prompt: systemPrompt, model: groqModel },
        { timeout: 30000, headers: { 'X-User-ID': req.user._id.toString() } }
      );
      aiResponse = fastapiRes.data;
    } catch (fastapiErr) {
      // If FastAPI unavailable, return error clearly
      return res.status(502).json({
        success: false,
        message: 'AI service unavailable',
        detail: fastapiErr.message,
      });
    }

    // Store conversation in MongoDB
    let conversation = await Conversation.findOne({ sessionId });
    if (!conversation) {
      conversation = new Conversation({ sessionId, userId: req.user._id });
    }
    conversation.messages.push({ role: 'user', content: message, type: 'text' });
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse.response || aiResponse.text || aiResponse,
      type: 'text',
    });
    await conversation.save();

    // Update session & user stats
    await sessionService.touch(sessionId);
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalMessages: 2 } });

    res.json({
      success: true,
      response: aiResponse.response || aiResponse.text || aiResponse,
      sessionId,
      messageCount: session.messageCount + 1,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/session/start
router.post('/session/start', authenticate, async (req, res, next) => {
  try {
    const greeting = await SystemConfig.get('ai_greeting');
    const sessionId = await sessionService.create(req.user._id);
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalSessions: 1 } });

    // Create initial conversation doc
    const conversation = new Conversation({
      sessionId,
      userId: req.user._id,
      messages: [{ role: 'assistant', content: greeting, type: 'text' }],
    });
    await conversation.save();

    res.json({ success: true, sessionId, greeting });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/session/end
router.post('/session/end', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });

    const session = await sessionService.get(sessionId);
    if (!session || session.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Invalid session' });
    }

    await sessionService.end(sessionId, 'user');
    await Conversation.findOneAndUpdate(
      { sessionId },
      { isActive: false, endedAt: new Date(), endedBy: 'user' }
    );

    res.json({ success: true, message: 'Session ended' });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/history - user's own conversation history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const conversations = await Conversation.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-messages');

    const total = await Conversation.countDocuments({ userId: req.user._id });

    res.json({ success: true, conversations, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/history/:sessionId
router.get('/history/:sessionId', authenticate, async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      sessionId: req.params.sessionId,
      userId: req.user._id,
    });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    res.json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
