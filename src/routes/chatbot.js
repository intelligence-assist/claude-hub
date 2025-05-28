const express = require('express');
const chatbotController = require('../controllers/chatbotController');

const router = express.Router();

// Discord webhook endpoint
router.post('/discord', chatbotController.handleDiscordWebhook);

// Slack webhook endpoint (placeholder for future implementation)
router.post('/slack', chatbotController.handleSlackWebhook);

// Nextcloud webhook endpoint (placeholder for future implementation)  
router.post('/nextcloud', chatbotController.handleNextcloudWebhook);

// Provider statistics endpoint
router.get('/stats', chatbotController.getProviderStats);

module.exports = router;