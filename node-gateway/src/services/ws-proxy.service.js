const WebSocket = require('ws');
const http = require('http');
const jwtService = require('../services/jwt.service');
const sessionService = require('../services/session.service');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const config = require('../config');

/**
 * Sets up authenticated WebSocket proxy to FastAPI.
 * Client connects with: ws://gateway/ws?token=JWT&sessionId=UUID
 * Gateway validates auth, then proxies to: ws://fastapi/ws/{sessionId}
 */
function setupWebSocketProxy(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (clientWs, req) => {
    // Parse query params
    const url = new URL(req.url, `ws://localhost`);
    const token = url.searchParams.get('token');
    const sessionId = url.searchParams.get('sessionId');

    // 1. Validate JWT
    if (!token) {
      clientWs.close(4001, 'No token provided');
      return;
    }
    const { valid, payload } = jwtService.verifyAccess(token);
    if (!valid) {
      clientWs.close(4001, 'Invalid token');
      return;
    }

    // 2. Validate session
    const session = await sessionService.get(sessionId);
    if (!session || session.userId !== payload.id) {
      clientWs.close(4003, 'Invalid session');
      return;
    }
    if (!session.isActive) {
      clientWs.close(4003, 'Session ended');
      return;
    }

    // 3. Connect to FastAPI WebSocket
    const fastapiWsUrl = `${config.fastapi.wsUrl}/ws/${sessionId}`;
    let fastapiWs;
    try {
      fastapiWs = new WebSocket(fastapiWsUrl, {
        headers: { 'X-User-ID': payload.id },
      });
    } catch (err) {
      clientWs.close(1011, 'AI service unavailable');
      return;
    }

    console.log(`🔌 WS connected: user=${payload.id} session=${sessionId}`);

    // Buffer messages until FastAPI is ready
    const messageBuffer = [];
    let fastapiReady = false;

    fastapiWs.on('open', () => {
      fastapiReady = true;
      messageBuffer.forEach(msg => fastapiWs.send(msg));
      messageBuffer.length = 0;
    });

    // FastAPI → Client
    fastapiWs.on('message', async (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }

      // Persist messages to MongoDB
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'transcript' || parsed.type === 'response') {
          await Conversation.findOneAndUpdate(
            { sessionId },
            {
              $push: {
                messages: {
                  role: parsed.type === 'transcript' ? 'user' : 'assistant',
                  content: parsed.text || parsed.content || '',
                  type: 'audio',
                },
              },
            },
            { upsert: true }
          );
          await sessionService.touch(sessionId);
          if (parsed.type === 'response') {
            await User.findByIdAndUpdate(payload.id, { $inc: { totalMessages: 2 } });
          }
        }
      } catch {}
    });

    // Client → FastAPI
    clientWs.on('message', async (data) => {
      if (fastapiReady && fastapiWs.readyState === WebSocket.OPEN) {
        fastapiWs.send(data);
      } else {
        messageBuffer.push(data);
      }
    });

    // Handle closes
    clientWs.on('close', (code, reason) => {
      console.log(`🔌 Client WS closed: ${code} ${reason}`);
      if (fastapiWs.readyState === WebSocket.OPEN) fastapiWs.close();
    });

    fastapiWs.on('close', (code, reason) => {
      console.log(`🔌 FastAPI WS closed: ${code} ${reason}`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    fastapiWs.on('error', (err) => {
      console.error('FastAPI WS error:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'AI service error' }));
      }
    });

    clientWs.on('error', (err) => console.error('Client WS error:', err.message));
  });

  console.log('✅ WebSocket proxy ready at /ws');
  return wss;
}

module.exports = setupWebSocketProxy;
