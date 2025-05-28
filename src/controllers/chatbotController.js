const claudeService = require('../services/claudeService');
const { createLogger } = require('../utils/logger');
const { sanitizeBotMentions } = require('../utils/sanitize');
const providerFactory = require('../providers/ProviderFactory');

const logger = createLogger('chatbotController');

/**
 * Generic chatbot webhook handler that works with any provider
 * Uses dependency injection to handle different chatbot platforms
 */
async function handleChatbotWebhook(req, res, providerName) {
  try {
    const startTime = Date.now();

    logger.info(
      {
        provider: providerName,
        method: req.method,
        path: req.path,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type']
        }
      },
      `Received ${providerName} webhook`
    );

    // Get or create provider
    let provider;
    try {
      provider = providerFactory.getProvider(providerName);
      if (!provider) {
        provider = await providerFactory.createFromEnvironment(providerName);
      }
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: providerName
        },
        'Failed to initialize chatbot provider'
      );
      return res.status(500).json({
        error: 'Provider initialization failed',
        message: error.message
      });
    }

    // Verify webhook signature
    try {
      const isValidSignature = provider.verifyWebhookSignature(req);
      if (!isValidSignature) {
        logger.warn(
          {
            provider: providerName,
            headers: Object.keys(req.headers)
          },
          'Invalid webhook signature'
        );
        return res.status(401).json({
          error: 'Invalid webhook signature'
        });
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          provider: providerName
        },
        'Webhook signature verification failed'
      );
      return res.status(401).json({
        error: 'Signature verification failed',
        message: error.message
      });
    }

    // Parse webhook payload
    let messageContext;
    try {
      messageContext = provider.parseWebhookPayload(req.body);

      logger.info(
        {
          provider: providerName,
          messageType: messageContext.type,
          userId: messageContext.userId,
          channelId: messageContext.channelId
        },
        'Parsed webhook payload'
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: providerName,
          bodyKeys: req.body ? Object.keys(req.body) : []
        },
        'Failed to parse webhook payload'
      );
      return res.status(400).json({
        error: 'Invalid payload format',
        message: error.message
      });
    }

    // Handle special responses (like Discord PING)
    if (messageContext.shouldRespond && messageContext.responseData) {
      const responseTime = Date.now() - startTime;
      logger.info(
        {
          provider: providerName,
          responseType: messageContext.type,
          responseTime: `${responseTime}ms`
        },
        'Sending immediate response'
      );
      return res.json(messageContext.responseData);
    }

    // Skip processing if no command detected
    if (messageContext.type === 'unknown' || !messageContext.content) {
      const responseTime = Date.now() - startTime;
      logger.info(
        {
          provider: providerName,
          messageType: messageContext.type,
          responseTime: `${responseTime}ms`
        },
        'No command detected, skipping processing'
      );
      return res.status(200).json({
        message: 'Webhook received but no command detected'
      });
    }

    // Extract bot command
    const commandInfo = provider.extractBotCommand(messageContext.content);
    if (!commandInfo) {
      const responseTime = Date.now() - startTime;
      logger.info(
        {
          provider: providerName,
          content: messageContext.content,
          responseTime: `${responseTime}ms`
        },
        'No bot mention found in message'
      );
      return res.status(200).json({
        message: 'Webhook received but no bot mention found'
      });
    }

    // Check user authorization
    const userId = provider.getUserId(messageContext);
    if (!provider.isUserAuthorized(userId)) {
      logger.info(
        {
          provider: providerName,
          userId: userId,
          username: messageContext.username
        },
        'Unauthorized user attempted to use bot'
      );

      try {
        const errorMessage = sanitizeBotMentions(
          '❌ Sorry, only authorized users can trigger Claude commands.'
        );
        await provider.sendResponse(messageContext, errorMessage);
      } catch (responseError) {
        logger.error(
          {
            err: responseError,
            provider: providerName
          },
          'Failed to send unauthorized user message'
        );
      }

      return res.status(200).json({
        message: 'Unauthorized user - command ignored',
        context: {
          provider: providerName,
          userId: userId
        }
      });
    }

    logger.info(
      {
        provider: providerName,
        userId: userId,
        username: messageContext.username,
        command: commandInfo.command.substring(0, 100)
      },
      'Processing authorized command'
    );

    try {
      // Extract repository and branch from message context (for Discord slash commands)
      const repoFullName = messageContext.repo || null;
      const branchName = messageContext.branch || 'main';

      // Validate required repository parameter
      if (!repoFullName) {
        const errorMessage = sanitizeBotMentions(
          '❌ **Repository Required**: Please specify a repository using the `repo` parameter.\n\n' +
            '**Example:** `/claude repo:owner/repository command:fix this issue`'
        );
        await provider.sendResponse(messageContext, errorMessage);

        return res.status(400).json({
          success: false,
          error: 'Repository parameter is required',
          context: {
            provider: providerName,
            userId: userId
          }
        });
      }

      // Process command with Claude
      const claudeResponse = await claudeService.processCommand({
        repoFullName: repoFullName,
        issueNumber: null,
        command: commandInfo.command,
        isPullRequest: false,
        branchName: branchName,
        chatbotContext: {
          provider: providerName,
          userId: userId,
          username: messageContext.username,
          channelId: messageContext.channelId,
          guildId: messageContext.guildId,
          repo: repoFullName,
          branch: branchName
        }
      });

      // Send response back to the platform
      await provider.sendResponse(messageContext, claudeResponse);

      const responseTime = Date.now() - startTime;
      logger.info(
        {
          provider: providerName,
          userId: userId,
          responseLength: claudeResponse ? claudeResponse.length : 0,
          responseTime: `${responseTime}ms`
        },
        'Command processed and response sent successfully'
      );

      return res.status(200).json({
        success: true,
        message: 'Command processed successfully',
        context: {
          provider: providerName,
          userId: userId,
          responseLength: claudeResponse ? claudeResponse.length : 0
        }
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: providerName,
          userId: userId,
          command: commandInfo.command.substring(0, 100)
        },
        'Error processing chatbot command'
      );

      // Generate error reference for tracking
      const timestamp = new Date().toISOString();
      const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;

      logger.error(
        {
          errorId,
          timestamp,
          error: error.message,
          stack: error.stack,
          provider: providerName,
          userId: userId,
          command: commandInfo.command
        },
        'Error processing chatbot command (with reference ID)'
      );

      // Try to send error message to user
      try {
        const errorMessage = provider.formatErrorMessage(error, errorId);
        await provider.sendResponse(messageContext, errorMessage);
      } catch (responseError) {
        logger.error(
          {
            err: responseError,
            provider: providerName
          },
          'Failed to send error message to user'
        );
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to process command',
        errorReference: errorId,
        timestamp: timestamp,
        context: {
          provider: providerName,
          userId: userId
        }
      });
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;

    logger.error(
      {
        errorId,
        timestamp,
        err: {
          message: error.message,
          stack: error.stack
        },
        provider: providerName
      },
      'Unexpected error in chatbot webhook handler'
    );

    return res.status(500).json({
      error: 'Internal server error',
      errorReference: errorId,
      timestamp: timestamp,
      provider: providerName
    });
  }
}

/**
 * Discord-specific webhook handler
 */
async function handleDiscordWebhook(req, res) {
  return await handleChatbotWebhook(req, res, 'discord');
}

/**
 * Get provider status and statistics
 */
async function getProviderStats(req, res) {
  try {
    const stats = providerFactory.getStats();
    const providerDetails = {};

    // Get detailed info for each initialized provider
    for (const [name, provider] of providerFactory.getAllProviders()) {
      providerDetails[name] = {
        name: provider.getProviderName(),
        initialized: true,
        botMention: provider.getBotMention()
      };
    }

    res.json({
      success: true,
      stats: stats,
      providers: providerDetails,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get provider stats');
    res.status(500).json({
      error: 'Failed to get provider statistics',
      message: error.message
    });
  }
}

module.exports = {
  handleChatbotWebhook,
  handleDiscordWebhook,
  getProviderStats
};
