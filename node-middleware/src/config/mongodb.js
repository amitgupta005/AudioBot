const mongoose = require('mongoose');
const config = require('./index');

const connectMongoDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ MongoDB connected:', config.mongodb.uri);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

module.exports = connectMongoDB;
