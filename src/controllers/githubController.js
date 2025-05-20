const crypto = require('crypto');
const claudeService = require('../services/claudeService');
const githubService = require('../services/githubService');
const { createLogger } = require('../utils/logger');
const { sanitizeBotMentions } = require('../utils/sanitize');

const logger = createLogger('githubController');

// Get bot username from environment variables - required
const BOT_USERNAME = process.env.BOT_USERNAME;

// Validate bot username is set to prevent accidental infinite loops
if (!BOT_USERNAME) {
  logger.error('BOT_USERNAME environment variable is not set. This is required to prevent infinite loops.');
  throw new Error('BOT_USERNAME environment variable is required');
}

// Additional validation - bot username should start with @
if (!BOT_USERNAME.startsWith('@')) {
  logger.warn('BOT_USERNAME should start with @ symbol for GitHub mentions. Current value:', BOT_USERNAME);
}

/**
 * Verifies that the webhook payload came from GitHub using the secret token
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.warn('No signature found in webhook request');
    throw new Error('No signature found in request');
  }

  logger.debug({
    signature: signature,
    secret: process.env.GITHUB_WEBHOOK_SECRET ? '[SECRET REDACTED]' : 'missing',
  }, 'Verifying webhook signature');

  const payload = req.rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  const calculatedSignature = 'sha256=' + hmac.update(payload).digest('hex');

  logger.debug('Webhook signature verification completed');

  // Skip verification if in test mode
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_WEBHOOK_VERIFICATION === '1') {
    logger.warn('Skipping webhook signature verification (test mode)');
    return true;
  }

  // Properly verify the signature using timing-safe comparison
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature))) {
    logger.debug('Webhook signature verification succeeded');
    return true;
  }

  logger.warn({
    receivedSignature: signature,
    calculatedSignature: calculatedSignature
  }, 'Webhook signature verification failed');
  throw new Error('Webhook signature verification failed');
}

/**
 * Handles incoming GitHub webhook events
 */
async function handleWebhook(req, res) {
  try {
    const event = req.headers['x-github-event'];
    const delivery = req.headers['x-github-delivery'];

    // Log webhook receipt with key details
    logger.info({
      event,
      delivery,
      sender: req.body.sender?.login,
      repo: req.body.repository?.full_name,
    }, `Received GitHub ${event} webhook`);

    // Verify the webhook signature
    try {
      verifyWebhookSignature(req);
    } catch (error) {
      logger.warn({ err: error }, 'Webhook verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature', message: error.message });
    }

    const payload = req.body;


    // Handle issue comment events
    if (event === 'issue_comment' && payload.action === 'created') {
      const comment = payload.comment;
      const issue = payload.issue;
      const repo = payload.repository;

      logger.info({
        repo: repo.full_name,
        issue: issue.number,
        comment: comment.id,
        user: comment.user.login
      }, 'Processing issue comment');

      // Check if comment mentions the bot
      if (comment.body.includes(BOT_USERNAME)) {
        // Check if the comment author is authorized
        const authorizedUsers = process.env.AUTHORIZED_USERS ? 
          process.env.AUTHORIZED_USERS.split(',').map(user => user.trim()) :
          ['Cheffromspace']; // Default authorized users
        const commentAuthor = comment.user.login;
        
        if (!authorizedUsers.includes(commentAuthor)) {
          logger.info({
            repo: repo.full_name,
            issue: issue.number,
            sender: commentAuthor,
            commentId: comment.id
          }, `Unauthorized user attempted to use ${BOT_USERNAME}`);
          
          // Post a comment explaining the restriction
          try {
            // Create a message without the bot name to prevent infinite loops
            const errorMessage = sanitizeBotMentions(
              `❌ Sorry @${commentAuthor}, only authorized users can trigger Claude commands.`
            );
            
            await githubService.postComment({
              repoOwner: repo.owner.login,
              repoName: repo.name,
              issueNumber: issue.number,
              body: errorMessage
            });
          } catch (commentError) {
            logger.error({ err: commentError }, 'Failed to post unauthorized user comment');
          }
          
          return res.status(200).json({
            success: true,
            message: 'Unauthorized user - command ignored',
            context: {
              repo: repo.full_name,
              issue: issue.number,
              sender: commentAuthor
            }
          });
        }

        logger.info({
          repo: repo.full_name,
          issue: issue.number,
          commentId: comment.id,
          sender: commentAuthor
        }, `Processing ${BOT_USERNAME} mention from authorized user`);

        // Extract the command for Claude
        // Create regex pattern from BOT_USERNAME, escaping special characters
        const escapedUsername = BOT_USERNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentionRegex = new RegExp(`${escapedUsername}\\s+(.*)`, 's');
        const commandMatch = comment.body.match(mentionRegex);
        if (commandMatch && commandMatch[1]) {
          const command = commandMatch[1].trim();

          try {
            // Process the command with Claude
            logger.info('Sending command to Claude service');
            const claudeResponse = await claudeService.processCommand({
              repoFullName: repo.full_name,
              issueNumber: issue.number,
              command: command,
              isPullRequest: false,
              branchName: null
            });

            // Post Claude's response as a comment on the issue
            logger.info('Posting Claude response as GitHub comment');
            await githubService.postComment({
              repoOwner: repo.owner.login,
              repoName: repo.name,
              issueNumber: issue.number,
              body: claudeResponse
            });

            // Return success in the webhook response
            logger.info('Claude response posted successfully');
            
            return res.status(200).json({
              success: true,
              message: 'Command processed and response posted',
              context: {
                repo: repo.full_name,
                issue: issue.number,
                type: 'issue_comment'
              }
            });
          } catch (error) {
            logger.error({ err: error }, 'Error processing Claude command');
            
            // Try to post an error comment
            try {
              // Generate a generic error message without details
              // Include a timestamp to help correlate with logs
              const timestamp = new Date().toISOString();
              const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;
              
              const errorMessage = sanitizeBotMentions(
                `❌ An error occurred while processing your command. (Reference: ${errorId}, Time: ${timestamp})
                
Please check with an administrator to review the logs for more details.`
              );
              
              // Log the actual error with the reference ID for correlation
              logger.error({
                errorId,
                timestamp,
                error: error.message,
                stack: error.stack,
                repo: repo.full_name,
                issue: issue.number,
                command: command
              }, 'Error processing command (with reference ID for correlation)');
              
              await githubService.postComment({
                repoOwner: repo.owner.login,
                repoName: repo.name,
                issueNumber: issue.number,
                body: errorMessage
              });
            } catch (commentError) {
              logger.error({ err: commentError }, 'Failed to post error comment');
            }
            
            return res.status(500).json({
              success: false,
              error: 'Failed to process command',
              message: error.message,
              context: {
                repo: repo.full_name,
                issue: issue.number,
                type: 'issue_comment'
              }
            });
          }
        }
      }
    }

    // Handle pull request comment events
    if ((event === 'pull_request_review_comment' || event === 'pull_request') && payload.action === 'created') {
      const pr = payload.pull_request;
      const repo = payload.repository;
      const comment = payload.comment || payload.pull_request.body;

      logger.info({
        repo: repo.full_name,
        pr: pr.number,
        user: payload.sender.login
      }, 'Processing pull request comment');

      // Check if comment mentions the bot
      if (comment && typeof comment === 'string' && comment.includes(BOT_USERNAME)) {
        logger.info({
          repo: repo.full_name,
          pr: pr.number,
          branch: pr.head.ref
        }, `Processing ${BOT_USERNAME} mention in PR`);

        // Extract the command for Claude
        // Create regex pattern from BOT_USERNAME, escaping special characters
        const escapedUsername = BOT_USERNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentionRegex = new RegExp(`${escapedUsername}\\s+(.*)`, 's');
        const commandMatch = comment.match(mentionRegex);
        if (commandMatch && commandMatch[1]) {
          const command = commandMatch[1].trim();

          try {
            // Process the command with Claude
            logger.info('Sending command to Claude service');
            const claudeResponse = await claudeService.processCommand({
              repoFullName: repo.full_name,
              issueNumber: pr.number,
              command: command,
              isPullRequest: true,
              branchName: pr.head.ref
            });

            // Return Claude's response in the webhook response
            logger.info('Returning Claude response via webhook');
            
            return res.status(200).json({
              success: true,
              message: 'Command processed successfully',
              claudeResponse: claudeResponse,
              context: {
                repo: repo.full_name,
                pr: pr.number,
                type: 'pull_request',
                branch: pr.head.ref
              }
            });
          } catch (error) {
            logger.error({ err: error }, 'Error processing Claude command');
            
            // Generate a unique error ID for correlation
            const timestamp = new Date().toISOString();
            const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;
            
            // Log the error with the reference ID
            logger.error({
              errorId,
              timestamp,
              error: error.message,
              stack: error.stack,
              repo: repo.full_name,
              pr: pr.number,
              command: command
            }, 'Error processing PR command (with reference ID for correlation)');
            
            // Send a sanitized generic error in the response
            return res.status(500).json({
              success: false,
              error: 'An error occurred while processing the command',
              errorReference: errorId,
              timestamp: timestamp,
              context: {
                repo: repo.full_name,
                pr: pr.number,
                type: 'pull_request'
              }
            });
          }
        }
      }
    }

    logger.info({ event }, 'Webhook processed successfully');
    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    // Generate a unique error reference
    const timestamp = new Date().toISOString();
    const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;
    
    // Log detailed error with reference
    logger.error({
      errorId,
      timestamp,
      err: {
        message: error.message,
        stack: error.stack
      }
    }, 'Error handling webhook (with error reference)');
    
    // Return generic error with reference ID
    return res.status(500).json({ 
      error: 'Failed to process webhook', 
      errorReference: errorId,
      timestamp: timestamp
    });
  }
}

module.exports = {
  handleWebhook
};