import express from 'express';
import { processCommand } from '../services/claudeService';
import { createLogger } from '../utils/logger';
import type { ClaudeAPIHandler } from '../types/express';

const router = express.Router();
const logger = createLogger('claudeRoutes');

/**
 * Direct endpoint for Claude processing
 * Allows calling Claude without GitHub webhook integration
 */
const handleClaudeRequest: ClaudeAPIHandler = async (req, res) => {
  logger.info({ request: req.body }, 'Received direct Claude request');
  try {
    const {
      repoFullName,
      repository,
      command,
      authToken,
      useContainer = false,
      issueNumber,
      isPullRequest = false,
      branchName
    } = req.body;

    // Handle both repoFullName and repository parameters
    const repoName = repoFullName ?? repository;

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
    if (process.env['CLAUDE_API_AUTH_REQUIRED'] === '1') {
      if (!authToken || authToken !== process.env['CLAUDE_API_AUTH_TOKEN']) {
        logger.warn('Invalid authentication token');
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
    }

    logger.info(
      {
        repo: repoName,
        commandLength: command.length,
        useContainer,
        issueNumber,
        isPullRequest
      },
      'Processing direct Claude command'
    );

    // Process the command with Claude
    let claudeResponse: string;
    try {
      claudeResponse = await processCommand({
        repoFullName: repoName,
        issueNumber: issueNumber ?? null,
        command,
        isPullRequest,
        branchName: branchName ?? null
      });

      logger.debug(
        {
          responseType: typeof claudeResponse,
          responseLength: claudeResponse ? claudeResponse.length : 0
        },
        'Raw Claude response received'
      );

      // Force a default response if empty
      if (!claudeResponse || claudeResponse.trim() === '') {
        claudeResponse =
          'No output received from Claude container. This is a placeholder response.';
      }
    } catch (processingError) {
      const err = processingError as Error;
      logger.error({ error: err }, 'Error during Claude processing');
      claudeResponse = `Error: ${err.message}`;
    }

    logger.info(
      {
        responseLength: claudeResponse ? claudeResponse.length : 0
      },
      'Successfully processed Claude command'
    );

    return res.status(200).json({
      message: 'Command processed successfully',
      response: claudeResponse
    });
  } catch (error) {
    const err = error as Error;
    logger.error(
      {
        err: {
          message: err.message,
          stack: err.stack
        }
      },
      'Error processing direct Claude command'
    );

    return res.status(500).json({
      error: 'Failed to process command',
      message: err.message
    });
  }
};

router.post('/', handleClaudeRequest as express.RequestHandler);

export default router;
