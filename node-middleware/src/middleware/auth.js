const TokenService = require('../services/tokenService');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const decoded = TokenService.verifyAccessToken(token);

    // Refresh user from DB to catch bans/deletions
    const user = await User.findById(decoded.id).select('+isActive +isBanned');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated' });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: `Account banned${user.banReason ? ': ' + user.banReason : ''}`,
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const requireCompany = (req, res, next) => {
  if (!req.user || req.user.role !== 'company') {
    return res.status(403).json({ success: false, message: 'Company access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireCompany };
