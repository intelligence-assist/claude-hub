const express = require('express');
const rateLimit = require('express-rate-limit');
const chatbotController = require('../controllers/chatbotController');

const router = express.Router();

// Rate limiting for chatbot webhooks
// Allow 100 requests per 15 minutes per IP to prevent abuse
// while allowing legitimate webhook traffic
const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many chatbot requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: _req => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  }
});

// Discord webhook endpoint
router.post('/discord', chatbotLimiter, chatbotController.handleDiscordWebhook);

// Provider statistics endpoint
router.get('/stats', chatbotController.getProviderStats);

module.exports = router;
