const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const WebSocket = require('ws');
const config = require('../config');
const TokenService = require('../services/tokenService');
const SessionService = require('../services/sessionService');

// HTTP proxy to FastAPI — injects user identity headers
const createFastapiProxy = () =>
  createProxyMiddleware({
    target: config.fastapiUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/ai': '' }, // strip /api/ai prefix → FastAPI root
    onProxyReq: (proxyReq, req) => {
      // Inject authenticated user identity so FastAPI knows who it's talking to
      if (req.user) {
        proxyReq.setHeader('X-User-Id', req.user._id.toString());
        proxyReq.setHeader('X-User-Email', req.user.email);
        proxyReq.setHeader('X-User-Role', req.user.role);
      }
      if (req.sessionId) {
        proxyReq.setHeader('X-Session-Id', req.sessionId);
      }
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({ success: false, message: 'AI service unavailable', error: err.message });
    },
  });

// WebSocket proxy to FastAPI — validates JWT from query param or header
const setupWebSocketProxy = (server) => {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/ws')) return;

    try {
      // Extract token from query string: /ws/audio?token=<jwt>&session=<id>
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const token = urlObj.searchParams.get('token');
      const sessionId = urlObj.searchParams.get('session');

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = TokenService.verifyAccessToken(token);

      // Validate session belongs to this user
      if (sessionId) {
        const session = await SessionService.get(sessionId);
        if (!session || session.userId !== decoded.id) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        await SessionService.update(sessionId, { lastActivity: new Date().toISOString() });
      }

      // Forward to FastAPI WebSocket — inject user info as custom headers
      const fastapiWsUrl = config.fastapiUrl.replace(/^http/, 'ws');
      const targetUrl = `${fastapiWsUrl}${req.url}`;

      req.headers['x-user-id'] = decoded.id;
      req.headers['x-user-email'] = decoded.email;
      req.headers['x-session-id'] = sessionId || '';

      const target = new WebSocket(targetUrl, { headers: req.headers });

      wss.handleUpgrade(req, socket, head, (client) => {
        // Bridge client ↔ FastAPI
        client.on('message', (msg) => {
          if (target.readyState === WebSocket.OPEN) target.send(msg);
        });
        target.on('message', (msg) => {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
        target.on('close', () => client.close());
        client.on('close', () => target.close());
        target.on('error', (err) => {
          console.error('FastAPI WS error:', err.message);
          client.close(1011, 'AI service error');
        });
      });
    } catch (err) {
      console.error('WS auth error:', err.message);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });
};

module.exports = { createFastapiProxy, setupWebSocketProxy };
