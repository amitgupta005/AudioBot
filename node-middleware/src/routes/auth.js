const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Job = require('../models/Job');
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
    body('jobId').optional({ checkFalsy: true }).isString().trim().notEmpty().withMessage('jobId must be a non-empty string'),
    body('role').optional().isIn(['user', 'company']).withMessage('Invalid role'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      let { name, email, password, jobId, role } = req.body;
      if (typeof jobId === 'string') jobId = jobId.trim();
      if (!jobId) jobId = null;

      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

      let companyId = null;
      if (jobId) {
        const job = await Job.findById(jobId);
        if (!job) return res.status(400).json({ success: false, message: 'Invalid jobId' });
        companyId = job.companyId;
      }

      // Explicitly allow only company or default to user for this endpoint
      const safeRole = role === 'company' ? 'company' : 'user';
      const user = await User.create({ name, email, password, jobId: jobId || null, companyId, role: safeRole });
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

// GET /auth/job/:jobId - verify a jobId (no auth required)
router.get('/job/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    return res.json({ success: true, job });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid jobId format' });
  }
});

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
