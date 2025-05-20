const express = require('express');
const router = express.Router();
const githubController = require('../controllers/githubController');

// GitHub webhook endpoint
router.post('/', githubController.handleWebhook);

module.exports = router;
