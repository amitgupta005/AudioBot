class AudioBotWS {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnects = 3;
  }

  connect(token, sessionId) {
    return new Promise((resolve, reject) => {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?token=${token}&sessionId=${sessionId}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('🔌 WS connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type || 'message', data);
        } catch {
          this.emit('raw', event.data);
        }
      };

      this.ws.onclose = (e) => {
        console.log('🔌 WS closed:', e.code, e.reason);
        this.emit('close', { code: e.code, reason: e.reason });
      };

      this.ws.onerror = (err) => {
        console.error('WS error:', err);
        this.emit('error', err);
        reject(err);
      };
    });
  }

  sendAudio(audioData) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  sendText(text) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', content: text }));
    }
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
    return () => {
      this.handlers[event] = this.handlers[event].filter(h => h !== handler);
    };
  }

  emit(event, data) {
    (this.handlers[event] || []).forEach(h => h(data));
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.handlers = {};
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export default new AudioBotWS();
