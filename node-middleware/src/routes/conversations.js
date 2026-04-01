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

    // jobId can come from user's JWT or from request body (for explicit job-specific sessions)
    const jobId = req.body.jobId || req.user.jobId || null;
    const companyId = req.user.companyId || (req.user.role === 'company' ? req.user._id : null);

    const [session, conversation] = await Promise.all([
      SessionService.create(sessionId, req.user._id, metadata),
      ConversationService.create(sessionId, req.user._id, metadata, jobId, companyId),
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
    let convo;
    if (req.user.role === 'admin') {
      convo = await ConversationService.getConversationDetails(req.params.sessionId, null);
    } else if (req.user.role === 'company') {
      convo = await ConversationService.getConversationDetailsByCompany(req.params.sessionId, req.user._id);
    } else {
      convo = await ConversationService.getConversationDetails(req.params.sessionId, req.user._id);
    }

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

// ─── INTERNAL API ENDPOINTS (for FastAPI backend sync) ──────────────────────
// These endpoints are NOT authenticated - they are for internal backend-to-backend communication
router.post('/internal/sync-message', async (req, res) => {
  try {
    const { sessionId, role, content, type = 'text' } = req.body;
    if (!sessionId || !role || !content) {
      return res.status(400).json({ success: false, message: 'sessionId, role, and content required' });
    }

    const message = { role, content, type, timestamp: new Date() };
    const convoUpdate = await ConversationService.appendMessage(sessionId, message);

    // Only append to existing conversations - don't create fallback conversations
    if (!convoUpdate) {
      console.warn(`⚠️  Conversation ${sessionId} not found for message sync. Conversation must be created via /start endpoint first.`);
      return res.status(404).json({ success: false, message: 'Conversation not found. Create it via POST /conversations/start endpoint first.' });
    }

    res.json({ success: true, message: 'Message synced to database' });
  } catch (err) {
    console.error('Error syncing message:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /internal/sync-conversation-end — mark conversation as ended
router.post('/internal/sync-conversation-end', async (req, res) => {
  try {
    const { sessionId, completionReason } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    const convoUpdate = await ConversationService.endSession(sessionId, 'system');
    if (!convoUpdate) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, message: 'Conversation marked as ended' });
  } catch (err) {
    console.error('Error ending conversation:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /internal/sync-full-conversation — sync all messages from Python backend (Redis) to MongoDB
// This ensures all initial/system messages are persisted
router.post('/internal/sync-full-conversation', async (req, res) => {
  try {
    const { sessionId, messages = [], source = 'python_backend' } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    // Get existing conversation - don't create fallback
    const convo = await ConversationService.findBySession(sessionId);
    
    if (!convo) {
      console.warn(`⚠️  Conversation ${sessionId} not found for full sync. Conversation must be created via /start endpoint first.`);
      return res.status(404).json({ success: false, message: 'Conversation not found. Create it via POST /conversations/start endpoint first.' });
    }

    // Build set of existing message contents to avoid duplicates
    const existingContents = new Set(
      (convo.messages || []).map(m => m.content)
    );

    // Add new messages that don't already exist
    let addedCount = 0;
    for (const msg of messages) {
      if (msg && msg.content && !existingContents.has(msg.content)) {
        const message = {
          role: msg.role || 'user',
          content: msg.content,
          type: msg.type || 'text',
          timestamp: msg.timestamp || new Date()
        };
        
        try {
          await ConversationService.appendMessage(sessionId, message);
          existingContents.add(msg.content);
          addedCount++;
        } catch (e) {
          console.warn(`Failed to add message to ${sessionId}: ${e.message}`);
        }
      }
    }

    res.json({ 
      success: true, 
      message: `Synced ${addedCount} new messages for conversation ${sessionId}`,
      addedCount 
    });
  } catch (err) {
    console.error('Error syncing full conversation:', err);
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

// POST /internal/sync-report — sync report URL from Python backend to MongoDB
router.post('/internal/sync-report', async (req, res) => {
  try {
    const { sessionId, reportUrl } = req.body;
    if (!sessionId || !reportUrl) {
      return res.status(400).json({ success: false, message: 'sessionId and reportUrl required' });
    }

    const convo = await ConversationService.findBySession(sessionId);
    if (!convo) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Update report URL in conversation
    convo.report = {
      pdfUrl: reportUrl,
      uploadedAt: new Date(),
      generatedAt: new Date()
    };
    await convo.save();

    res.json({ 
      success: true, 
      message: 'Report URL synced to MongoDB',
      reportUrl: reportUrl
    });
  } catch (err) {
    console.error('Error syncing report:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
