const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const jwtService = require('../services/jwt.service');
const sessionService = require('../services/session.service');
const { authenticate } = require('../middleware/auth.middleware');

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const regEnabled = await SystemConfig.get('registration_enabled');
    if (regEnabled === false) {
      return res.status(403).json({ success: false, message: 'Registration is currently disabled' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const user = await User.create({ name, email, password });
    const tokens = jwtService.generateTokens(user);
    const sessionId = await sessionService.create(user._id);

    // Update user stats
    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      $inc: { loginCount: 1, totalSessions: 1 },
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: user.toSafeObject(),
      sessionId,
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: `Account banned: ${user.bannedReason || 'Policy violation'}`,
      });
    }

    const tokens = jwtService.generateTokens(user);
    const sessionId = await sessionService.create(user._id);

    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      $inc: { loginCount: 1, totalSessions: 1 },
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: user.toSafeObject(),
      sessionId,
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    const { valid, payload, error } = jwtService.verifyRefresh(refreshToken);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token', error });
    }

    const user = await User.findById(payload.id);
    if (!user || !user.isActive || user.isBanned) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    const tokens = jwtService.generateTokens(user);
    res.json({ success: true, ...tokens });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) await sessionService.end(sessionId, 'user');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject ? req.user.toSafeObject() : req.user });
});

module.exports = router;
