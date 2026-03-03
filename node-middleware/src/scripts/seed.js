require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectMongoDB = require('../config/mongodb');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const config = require('../config');

const seed = async () => {
  await connectMongoDB();
  console.log('🌱 Seeding database...');

  // Create admin user
  const existing = await User.findOne({ email: config.admin.email });
  if (existing) {
    console.log(`✅ Admin already exists: ${config.admin.email}`);
  } else {
    await User.create({
      name: 'Administrator',
      email: config.admin.email,
      password: config.admin.password,
      role: 'admin',
    });
    console.log(`✅ Admin created: ${config.admin.email}`);
  }

  // Seed default system config
  const defaults = [
    { key: 'ai.systemPrompt', value: 'You are a professional AI assistant. Answer clearly and concisely.', description: 'System prompt sent to the AI' },
    { key: 'ai.greeting', value: 'Hello! How can I assist you today?', description: 'Greeting message shown on new session' },
    { key: 'ai.model', value: 'qwen-qwq-32b', description: 'Groq model identifier' },
    { key: 'session.maxDurationMinutes', value: 60, description: 'Auto-end session after N minutes of inactivity' },
    { key: 'session.maxMessages', value: 200, description: 'Max messages per session' },
    { key: 'registration.enabled', value: true, description: 'Allow new user registrations' },
  ];

  for (const { key, value, description } of defaults) {
    const exists = await SystemConfig.findOne({ key });
    if (!exists) {
      await SystemConfig.set(key, value, description);
      console.log(`✅ Config seeded: ${key}`);
    }
  }

  console.log('\n🎉 Seed complete!\n');
  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
