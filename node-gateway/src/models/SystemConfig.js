const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

// Defaults
const DEFAULTS = {
  system_prompt: {
    value: 'You are a professional AI assistant. Be helpful, clear, and concise.',
    description: 'AI system prompt sent to Groq LLM',
  },
  ai_greeting: {
    value: 'Hello! How can I assist you today?',
    description: 'First message sent when a session starts',
  },
  groq_model: {
    value: 'qwen-qwq-32b',
    description: 'Groq model identifier',
  },
  max_session_messages: {
    value: 100,
    description: 'Maximum messages per session before auto-ending',
  },
  session_ttl_seconds: {
    value: 3600,
    description: 'Redis session TTL in seconds',
  },
  registration_enabled: {
    value: true,
    description: 'Allow new user registrations',
  },
};

SystemConfig.seedDefaults = async () => {
  for (const [key, meta] of Object.entries(DEFAULTS)) {
    await SystemConfig.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, value: meta.value, description: meta.description } },
      { upsert: true, new: true }
    );
  }
};

SystemConfig.get = async (key) => {
  const doc = await SystemConfig.findOne({ key });
  return doc ? doc.value : DEFAULTS[key]?.value ?? null;
};

module.exports = SystemConfig;
