const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'audio'], default: 'text' },
    audioDurationMs: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New Conversation' },
    messages: [messageSchema],
    messageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    endedAt: { type: Date, default: null },
    endedBy: { type: String, enum: ['user', 'admin', 'timeout', null], default: null },
    metadata: {
      userAgent: String,
      ipAddress: String,
      totalTokensUsed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Auto-update title from first user message
conversationSchema.pre('save', function (next) {
  if (this.messages.length > 0 && this.title === 'New Conversation') {
    const firstUserMsg = this.messages.find((m) => m.role === 'user');
    if (firstUserMsg) {
      this.title = firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
    }
  }
  this.messageCount = this.messages.length;
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);
