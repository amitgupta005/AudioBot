const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'audio'], default: 'text' },
  audioUrl: { type: String },
  duration: { type: Number }, // seconds
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed },
});

const conversationSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: String, index: true },
  title: { type: String, default: 'New Conversation' },
  messages: [messageSchema],
  isActive: { type: Boolean, default: true },
  endedAt: { type: Date },
  endedBy: { type: String, enum: ['user', 'admin', 'timeout', 'system'] },
  messageCount: { type: Number, default: 0 },
  summary: { type: String }, // AI-generated summary
  tags: [String],
  metadata: { type: mongoose.Schema.Types.Mixed },
  report: {
    pdfUrl: { type: String }, // Cloudinary URL
    pdfPublicId: { type: String }, // Cloudinary public ID
    uploadedAt: { type: Date },
    generatedAt: { type: Date },
  },
}, { timestamps: true });

conversationSchema.pre('save', function (next) {
  this.messageCount = this.messages.length;
  if (!this.title || this.title === 'New Conversation') {
    const firstUserMsg = this.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      this.title = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '…' : '');
    }
  }
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);
