const express = require('express');
const router = express.Router();
const claudeService = require('../services/claudeService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('claudeRoutes');


/**
 * Direct endpoint for Claude processing
 * Allows calling Claude without GitHub webhook integration
 */
router.post('/', async (req, res) => {
  logger.info({ request: req.body }, 'Received direct Claude request');
  try {
    const { repoFullName, repository, command, authToken, useContainer = false } = req.body;
    
    // Handle both repoFullName and repository parameters
    const repoName = repoFullName || repository;

    // Validate required parameters
    if (!repoName) {
      logger.warn('Missing repository name in request');
      return res.status(400).json({ error: 'Repository name is required' });
    }

    if (!command) {
      logger.warn('Missing command in request');
      return res.status(400).json({ error: 'Command is required' });
    }

    // Validate authentication if enabled
    if (process.env.CLAUDE_API_AUTH_REQUIRED === '1') {
      if (!authToken || authToken !== process.env.CLAUDE_API_AUTH_TOKEN) {
        logger.warn('Invalid authentication token');
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
    }

    logger.info({
      repo: repoName,
      commandLength: command.length,
      useContainer
    }, 'Processing direct Claude command');

    // Process the command with Claude
    let claudeResponse;
    try {
      claudeResponse = await claudeService.processCommand({
        repoFullName: repoName,
        issueNumber: null, // No issue number for direct calls
        command,
        isPullRequest: false,
        branchName: null
      });

      logger.debug({
        responseType: typeof claudeResponse,
        responseLength: claudeResponse ? claudeResponse.length : 0
      }, 'Raw Claude response received');

      // Force a default response if empty
      if (!claudeResponse || claudeResponse.trim() === '') {
        claudeResponse = "No output received from Claude container. This is a placeholder response.";
      }
    } catch (processingError) {
      logger.error({ error: processingError }, 'Error during Claude processing');
      claudeResponse = `Error: ${processingError.message}`;
    }

    logger.info({
      responseLength: claudeResponse ? claudeResponse.length : 0
    }, 'Successfully processed Claude command');

    return res.status(200).json({
      message: 'Command processed successfully',
      response: claudeResponse
    });
  } catch (error) {
    logger.error({
      err: {
        message: error.message,
        stack: error.stack
      }
    }, 'Error processing direct Claude command');
    
    return res.status(500).json({ 
      error: 'Failed to process command',
      message: error.message
    });
  }
});

module.exports = router;