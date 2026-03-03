const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const TokenService = require('../services/tokenService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts' });

// POST /auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { name, email, password } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

      const user = await User.create({ name, email, password });
      const tokens = TokenService.generateTokenPair(user);

      res.status(201).json({
        success: true,
        message: 'Account created',
        user: user.toSafeObject(),
        ...tokens,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
    }
  }
);

// POST /auth/login
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      if (user.isBanned) {
        return res.status(403).json({ success: false, message: `Account banned${user.banReason ? ': ' + user.banReason : ''}` });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account deactivated' });
      }

      user.lastLogin = new Date();
      await user.save();

      const tokens = TokenService.generateTokenPair(user);
      res.json({ success: true, user: user.toSafeObject(), ...tokens });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Login failed', error: err.message });
    }
  }
);

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

    const decoded = TokenService.verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive || user.isBanned) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const tokens = TokenService.generateTokenPair(user);
    res.json({ success: true, ...tokens });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

// POST /auth/logout (client-side token discard; placeholder for blocklist if needed)
router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
