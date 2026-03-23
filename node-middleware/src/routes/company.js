const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireCompany } = require('../middleware/auth');
const Job = require('../models/Job');
const ConversationService = require('../services/conversationService');

const router = express.Router();

// All company routes require auth + company role
router.use(authenticate, requireCompany);

// GET /company/jobs - list jobs owned by the company
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await Job.find({ companyId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /company/jobs - create a new job posting
router.post(
  '/jobs',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { title, description } = req.body;
      const job = await Job.create({ title, description, companyId: req.user._id, createdBy: req.user._id });
      res.status(201).json({ success: true, job });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// GET /company/jobs/:jobId - get job details
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.jobId, companyId: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /company/jobs/:jobId/conversations - list conversations for this job
router.get('/jobs/:jobId/conversations', async (req, res) => {
  try {
    // Ensure job belongs to this company
    const job = await Job.findOne({ _id: req.params.jobId, companyId: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const result = await ConversationService.getConversationsByJobId(job._id, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
