const jwtService = require('../services/jwt.service');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  const token = jwtService.extractFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const { valid, payload, error } = jwtService.verifyAccess(token);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token', error });
  }

  const user = await User.findById(payload.id).select('-password');
  if (!user) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }
  if (!user.isActive || user.isBanned) {
    return res.status(403).json({
      success: false,
      message: user.isBanned ? `Account banned: ${user.bannedReason || 'Policy violation'}` : 'Account inactive',
    });
  }

  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  const token = jwtService.extractFromHeader(req.headers.authorization);
  if (token) {
    const { valid, payload } = jwtService.verifyAccess(token);
    if (valid) {
      req.user = await User.findById(payload.id).select('-password');
    }
  }
  next();
};

module.exports = { authenticate, requireAdmin, optionalAuth };
