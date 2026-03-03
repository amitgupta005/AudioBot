const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const SessionService = require('../services/sessionService');
const ConversationService = require('../services/conversationService');

const router = express.Router();

// POST /conversations/start — create a new session
router.post('/start', authenticate, async (req, res) => {
  try {
    const sessionId = uuidv4();
    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };

    const [session, conversation] = await Promise.all([
      SessionService.create(sessionId, req.user._id, metadata),
      ConversationService.create(sessionId, req.user._id, metadata),
    ]);

    res.status(201).json({ success: true, sessionId, session, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /conversations — list user's conversations
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await ConversationService.getUserConversations(req.user._id, +page, +limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /conversations/:sessionId — get full conversation
router.get('/:sessionId', authenticate, async (req, res) => {
  try {
    const convo = await ConversationService.getConversationDetails(
      req.params.sessionId,
      req.user.role === 'admin' ? null : req.user._id
    );
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, conversation: convo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /conversations/:sessionId/message — store a message
router.post('/:sessionId/message', authenticate, async (req, res) => {
  try {
    const { role, content, type = 'text', audioDurationMs } = req.body;
    if (!role || !content) return res.status(400).json({ success: false, message: 'role and content required' });

    const message = { role, content, type, audioDurationMs, timestamp: new Date() };

    const [sessionUpdate, convoUpdate] = await Promise.all([
      SessionService.appendMessage(req.params.sessionId, message),
      ConversationService.appendMessage(req.params.sessionId, message),
    ]);

    if (!convoUpdate) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /conversations/:sessionId/end — end a session
router.post('/:sessionId/end', authenticate, async (req, res) => {
  try {
    const endedBy = req.user.role === 'admin' ? 'admin' : 'user';
    const [session, convo] = await Promise.all([
      SessionService.end(req.params.sessionId),
      ConversationService.endSession(req.params.sessionId, endedBy),
    ]);
    res.json({ success: true, message: 'Session ended', sessionId: req.params.sessionId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /conversations/:sessionId/context — get Redis context for FastAPI
router.get('/:sessionId/context', authenticate, async (req, res) => {
  try {
    const session = await SessionService.get(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found or expired' });
    res.json({ success: true, messages: session.messages, sessionId: session.sessionId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
