const mongoose = require('mongoose');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const config = require('../config');

const seedAdmin = async () => {
  await mongoose.connect(config.mongodb.uri);

  // Seed default system configs
  await SystemConfig.seedDefaults();
  console.log('✅ SystemConfig defaults seeded');

  // Create admin user if not exists
  const existing = await User.findOne({ email: config.admin.email });
  if (!existing) {
    await User.create({
      name: config.admin.name,
      email: config.admin.email,
      password: config.admin.password,
      role: 'admin',
    });
    console.log(`✅ Admin user created: ${config.admin.email}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${config.admin.email}`);
  }

  await mongoose.disconnect();
  console.log('✅ Seed complete');
};

seedAdmin().catch(console.error);
