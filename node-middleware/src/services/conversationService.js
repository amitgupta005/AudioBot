const Conversation = require('../models/Conversation');
const User = require('../models/User');

const ConversationService = {
  async create(sessionId, userId, metadata = {}) {
    const convo = new Conversation({ sessionId, userId, metadata });
    await convo.save();
    await User.findByIdAndUpdate(userId, { $inc: { totalConversations: 1 } });
    return convo;
  },

  async findBySession(sessionId) {
    return Conversation.findOne({ sessionId }).populate('userId', 'name email');
  },

  async appendMessage(sessionId, message) {
    const convo = await Conversation.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: message },
        $inc: { messageCount: 1 },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );
    if (convo && message.role === 'user') {
      await User.findByIdAndUpdate(convo.userId, { $inc: { totalMessages: 1 } });
    }
    return convo;
  },

  async endSession(sessionId, endedBy = 'user') {
    return Conversation.findOneAndUpdate(
      { sessionId },
      { isActive: false, endedAt: new Date(), endedBy },
      { new: true }
    );
  },

  async getUserConversations(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [conversations, total] = await Promise.all([
      Conversation.find({ userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages'),
      Conversation.countDocuments({ userId }),
    ]);
    return { conversations, total, page, pages: Math.ceil(total / limit) };
  },

  async getConversationDetails(sessionId, userId = null) {
    const query = { sessionId };
    if (userId) query.userId = userId; // non-admin can only see own
    return Conversation.findOne(query).populate('userId', 'name email');
  },

  async getAllConversations(page = 1, limit = 20, filters = {}) {
    const query = {};
    if (filters.userId) query.userId = filters.userId;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.search) query.title = { $regex: filters.search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .select('-messages'),
      Conversation.countDocuments(query),
    ]);
    return { conversations, total, page, pages: Math.ceil(total / limit) };
  },

  async getStats() {
    const [total, active, today] = await Promise.all([
      Conversation.countDocuments(),
      Conversation.countDocuments({ isActive: true }),
      Conversation.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
    ]);
    return { total, active, today };
  },
};

module.exports = ConversationService;
