const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

// Helpers
SystemConfig.get = async (key, defaultValue = null) => {
  const doc = await SystemConfig.findOne({ key });
  return doc ? doc.value : defaultValue;
};

SystemConfig.set = async (key, value, description = '', updatedBy = null) => {
  return SystemConfig.findOneAndUpdate(
    { key },
    { value, description, updatedBy },
    { upsert: true, new: true }
  );
};

module.exports = SystemConfig;
