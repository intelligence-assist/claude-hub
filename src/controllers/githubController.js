const crypto = require('crypto');
const claudeService = require('../services/claudeService');
const githubService = require('../services/githubService');
const { createLogger } = require('../utils/logger');
const { sanitizeBotMentions, sanitizeLabels } = require('../utils/sanitize');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('githubController');

// Get bot username from environment variables - required
const BOT_USERNAME = process.env.BOT_USERNAME;

// Validate bot username is set to prevent accidental infinite loops
if (!BOT_USERNAME) {
  logger.error(
    'BOT_USERNAME environment variable is not set. This is required to prevent infinite loops.'
  );
  throw new Error('BOT_USERNAME environment variable is required');
}

// Additional validation - bot username should start with @
if (!BOT_USERNAME.startsWith('@')) {
  logger.warn(
    'BOT_USERNAME should start with @ symbol for GitHub mentions. Current value:',
    BOT_USERNAME
  );
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

  logger.debug(
    {
      signature: signature,
      secret: process.env.GITHUB_WEBHOOK_SECRET ? '[SECRET REDACTED]' : 'missing'
    },
    'Verifying webhook signature'
  );

  const webhookSecret = secureCredentials.get('GITHUB_WEBHOOK_SECRET');
  if (!webhookSecret) {
    logger.error('GITHUB_WEBHOOK_SECRET not found in secure credentials');
    throw new Error('Webhook secret not configured');
  }

  const payload = req.rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', webhookSecret);
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

  logger.warn(
    {
      receivedSignature: signature,
      calculatedSignature: calculatedSignature
    },
    'Webhook signature verification failed'
  );
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
    logger.info(
      {
        event,
        delivery,
        sender: req.body.sender?.login,
        repo: req.body.repository?.full_name
      },
      `Received GitHub ${event} webhook`
    );

    // Verify the webhook signature
    try {
      verifyWebhookSignature(req);
    } catch (error) {
      logger.warn({ err: error }, 'Webhook verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature', message: error.message });
    }

    const payload = req.body;

    // Handle issues being opened for auto-tagging
    if (event === 'issues' && payload.action === 'opened') {
      const issue = payload.issue;
      const repo = payload.repository;

      logger.info(
        {
          repo: repo.full_name,
          issue: issue.number,
          title: issue.title,
          user: issue.user.login
        },
        'Processing new issue for auto-tagging'
      );

      try {
        // Process the issue with Claude for automatic tagging
        const tagCommand = `Analyze this issue and apply appropriate labels:

Title: ${issue.title}
Description: ${issue.body || 'No description provided'}

Available labels:
- Priority: critical, high, medium, low
- Type: bug, feature, enhancement, documentation, question, security
- Complexity: trivial, simple, moderate, complex
- Component: api, frontend, backend, database, auth, webhook, docker

Return ONLY a JSON object with the labels to apply:
{
  "labels": ["priority:medium", "type:feature", "complexity:simple", "component:api"]
}`;

        logger.info('Sending issue to Claude for auto-tagging analysis');
        const claudeResponse = await claudeService.processCommand({
          repoFullName: repo.full_name,
          issueNumber: issue.number,
          command: tagCommand,
          isPullRequest: false,
          branchName: null
        });

        // Parse Claude's response and apply labels
        try {
          // Extract JSON from Claude's response (it might have additional text) using safer approach
          const jsonStart = claudeResponse.indexOf('{');
          const jsonEnd = claudeResponse.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            const jsonString = claudeResponse.substring(jsonStart, jsonEnd + 1);
            const labelSuggestion = JSON.parse(jsonString);

            if (labelSuggestion.labels && Array.isArray(labelSuggestion.labels)) {
              // Apply the suggested labels
              await githubService.addLabelsToIssue({
                repoOwner: repo.owner.login,
                repoName: repo.name,
                issueNumber: issue.number,
                labels: labelSuggestion.labels
              });

              // Auto-tagging completed - no comment needed for subtlety

              const sanitizedLabels = sanitizeLabels(labelSuggestion.labels);
              logger.info(
                {
                  repo: repo.full_name,
                  issue: issue.number,
                  labelCount: sanitizedLabels.length
                },
                'Auto-tagging completed successfully'
              );
            }
          }
        } catch (parseError) {
          logger.warn(
            {
              err: parseError,
              claudeResponseLength: claudeResponse.length,
              claudeResponsePreview: '[RESPONSE_CONTENT_REDACTED]'
            },
            'Failed to parse Claude response for auto-tagging'
          );

          // Fall back to basic tagging based on keywords
          const fallbackLabels = await githubService.getFallbackLabels(issue.title, issue.body);
          if (fallbackLabels.length > 0) {
            await githubService.addLabelsToIssue({
              repoOwner: repo.owner.login,
              repoName: repo.name,
              issueNumber: issue.number,
              labels: fallbackLabels
            });
          }
        }

        return res.status(200).json({
          success: true,
          message: 'Issue auto-tagged successfully',
          context: {
            repo: repo.full_name,
            issue: issue.number,
            type: 'issues_opened'
          }
        });
      } catch (error) {
        logger.error(
          {
            errorMessage: error.message || 'Unknown error',
            errorType: error.constructor.name
          },
          'Error processing issue for auto-tagging'
        );

        // Return success anyway to not block webhook
        return res.status(200).json({
          success: true,
          message: 'Issue received but auto-tagging failed',
          context: {
            repo: repo.full_name,
            issue: issue.number,
            type: 'issues_opened'
          }
        });
      }
    }

    // Handle issue comment events
    if (event === 'issue_comment' && payload.action === 'created') {
      const comment = payload.comment;
      const issue = payload.issue;
      const repo = payload.repository;

      logger.info(
        {
          repo: repo.full_name,
          issue: issue.number,
          comment: comment.id,
          user: comment.user.login
        },
        'Processing issue comment'
      );

      // Check if comment mentions the bot
      if (comment.body.includes(BOT_USERNAME)) {
        // Check if the comment author is authorized
        const authorizedUsers = process.env.AUTHORIZED_USERS
          ? process.env.AUTHORIZED_USERS.split(',').map(user => user.trim())
          : [process.env.DEFAULT_AUTHORIZED_USER || 'admin']; // Default authorized user
        const commentAuthor = comment.user.login;

        if (!authorizedUsers.includes(commentAuthor)) {
          logger.info(
            {
              repo: repo.full_name,
              issue: issue.number,
              sender: commentAuthor,
              commentId: comment.id
            },
            `Unauthorized user attempted to use ${BOT_USERNAME}`
          );

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

        logger.info(
          {
            repo: repo.full_name,
            issue: issue.number,
            commentId: comment.id,
            sender: commentAuthor
          },
          `Processing ${BOT_USERNAME} mention from authorized user`
        );

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
              logger.error(
                {
                  errorId,
                  timestamp,
                  error: error.message,
                  stack: error.stack,
                  repo: repo.full_name,
                  issue: issue.number,
                  command: command
                },
                'Error processing command (with reference ID for correlation)'
              );

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

    // Handle check suite completion for automated PR review
    if (event === 'check_suite' && payload.action === 'completed') {
      const checkSuite = payload.check_suite;
      const repo = payload.repository;

      logger.info(
        {
          repo: repo.full_name,
          checkSuiteId: checkSuite.id,
          conclusion: checkSuite.conclusion,
          status: checkSuite.status,
          headBranch: checkSuite.head_branch,
          headSha: checkSuite.head_sha,
          pullRequestCount: checkSuite.pull_requests?.length || 0,
          pullRequests: checkSuite.pull_requests?.map(pr => ({
            number: pr.number,
            headRef: pr.head?.ref,
            headSha: pr.head?.sha
          }))
        },
        'Processing check_suite completed event'
      );

      // Only proceed if the check suite is for a pull request and conclusion is success
      if (checkSuite.conclusion === 'success' && checkSuite.pull_requests && checkSuite.pull_requests.length > 0) {
        try {
          for (const pr of checkSuite.pull_requests) {
            // Verify ALL required status checks have passed using Combined Status API
            let combinedStatus;
            try {
            // Use the check suite's head_sha if pr.head.sha is not available
              const commitSha = pr.head?.sha || checkSuite.head_sha;
            
              if (!commitSha) {
                logger.error(
                  {
                    repo: repo.full_name,
                    pr: pr.number,
                    prData: JSON.stringify(pr),
                    checkSuiteData: {
                      id: checkSuite.id,
                      head_sha: checkSuite.head_sha,
                      head_branch: checkSuite.head_branch
                    }
                  },
                  'No commit SHA available for PR - cannot check combined status'
                );
                continue;
              }
            
              logger.info(
                {
                  repo: repo.full_name,
                  pr: pr.number,
                  prHeadSha: pr.head?.sha,
                  checkSuiteHeadSha: checkSuite.head_sha,
                  usingSha: commitSha
                },
                'Getting combined status for PR'
              );

              combinedStatus = await githubService.getCombinedStatus({
                repoOwner: repo.owner.login,
                repoName: repo.name,
                ref: commitSha
              });

              // Only proceed if ALL status checks are successful
              if (combinedStatus.state !== 'success') {
                logger.info(
                  {
                    repo: repo.full_name,
                    pr: pr.number,
                    checkSuite: checkSuite.id,
                    combinedState: combinedStatus.state,
                    totalChecks: combinedStatus.total_count
                  },
                  'Skipping PR review - not all required status checks have passed'
                );
                continue;
              }
            } catch (error) {
              logger.error(
                {
                  err: error.message,
                  repo: repo.full_name,
                  pr: pr.number,
                  checkSuite: checkSuite.id
                },
                'Error checking combined status - skipping PR review'
              );
              continue;
            }

            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: checkSuite.id,
                conclusion: checkSuite.conclusion,
                combinedState: combinedStatus.state,
                totalChecks: combinedStatus.total_count
              },
              'All checks passed - triggering automated PR review'
            );

            try {
            // Create the PR review prompt
              const prReviewPrompt = `## PR Review Workflow Instructions

You are Claude, acting as a professional code reviewer through Claude Code CLI. Your task is to review GitHub pull requests and provide constructive feedback.

### Initial Setup
1. Review the PR that has been checked out for you

### Review Process
1. First, get an overview of the PR:
   \`\`\`bash
   gh pr view ${pr.number} --json title,body,additions,deletions,changedFiles
   \`\`\`

2. Examine the changed files:
   \`\`\`bash
   gh pr diff ${pr.number}
   \`\`\`

3. For each file, check:
   - Security vulnerabilities
   - Logic errors or edge cases
   - Performance issues
   - Code organization
   - Error handling
   - Test coverage

4. When needed, examine specific files:
   \`\`\`bash
   gh pr view ${pr.number} --json files
   cat [FILE_PATH]
   \`\`\`

### Providing Feedback
For each significant issue:
1. Add a comment to the specific line:
   \`\`\`bash
   gh pr comment ${pr.number} --body "YOUR COMMENT" --file [FILE] --line [LINE_NUMBER]
   \`\`\`

2. For general feedback, add a PR comment:
   \`\`\`bash
   gh pr comment ${pr.number} --body "YOUR REVIEW SUMMARY"
   \`\`\`

3. Complete your review with an approval or change request:
   \`\`\`bash
   # For approval:
   gh pr review ${pr.number} --approve --body "APPROVAL MESSAGE"
   
   # For requesting changes:
   gh pr review ${pr.number} --request-changes --body "CHANGE REQUEST SUMMARY"
   \`\`\`

### Review Focus Areas
1. Potential security vulnerabilities (injection attacks, authentication issues, etc.)
2. Logic bugs or edge cases
3. Performance issues (inefficient algorithms, unnecessary computations)
4. Code organization and maintainability
5. Error handling and edge cases
6. Test coverage and effectiveness
7. Documentation quality

### Comment Style Guidelines
- Be specific and actionable
- Explain why issues matter, not just what they are
- Suggest concrete improvements
- Balance criticism with positive reinforcement
- Group related issues
- Use a professional, constructive tone

### Review Summary Format
1. Brief summary of changes and overall assessment
2. Key issues organized by file
3. Positive aspects of the implementation
4. Conclusion with recommended next steps

After completing the review, all output from this process will be automatically saved as comments in the workflow. No additional logging is required.

Please perform a comprehensive review of PR #${pr.number} in repository ${repo.full_name}.`;

              // Process the PR review with Claude
              logger.info('Sending PR for automated Claude review');
              const claudeResponse = await claudeService.processCommand({
                repoFullName: repo.full_name,
                issueNumber: pr.number,
                command: prReviewPrompt,
                isPullRequest: true,
                branchName: pr.head.ref
              });

              logger.info(
                {
                  repo: repo.full_name,
                  pr: pr.number,
                  responseLength: claudeResponse ? claudeResponse.length : 0
                },
                'Automated PR review completed successfully'
              );
            } catch (error) {
              logger.error(
                {
                  errorMessage: error.message || 'Unknown error',
                  errorType: error.constructor.name,
                  repo: repo.full_name,
                  pr: pr.number,
                  checkSuite: checkSuite.id
                },
                'Error processing automated PR review'
              );
            }
          }
          // Return success after processing all PRs
          return res.status(200).json({
            success: true,
            message: 'Check suite completion processed - PR review triggered',
            context: {
              repo: repo.full_name,
              checkSuite: checkSuite.id,
              conclusion: checkSuite.conclusion,
              pullRequests: checkSuite.pull_requests.map(pr => pr.number)
            }
          });
        } catch (error) {
          logger.error(
            {
              err: error,
              repo: repo.full_name,
              checkSuite: checkSuite.id
            },
            'Error processing check suite for PR reviews'
          );
          
          return res.status(500).json({
            success: false,
            error: 'Failed to process check suite',
            message: error.message,
            context: {
              repo: repo.full_name,
              checkSuite: checkSuite.id,
              type: 'check_suite'
            }
          });
        }
      } else if (checkSuite.head_branch) {
        // If no pull requests in payload but we have a head_branch,
        // this might be a PR from a fork - log for debugging
        logger.warn(
          {
            repo: repo.full_name,
            checkSuite: checkSuite.id,
            headBranch: checkSuite.head_branch,
            headSha: checkSuite.head_sha
          },
          'Check suite succeeded but no pull requests found in payload - possible fork PR'
        );
        
        // TODO: Could query GitHub API to find PRs for this branch/SHA
        // For now, just acknowledge the webhook
        return res.status(200).json({
          success: true,
          message: 'Check suite completed but no PRs found in payload',
          context: {
            repo: repo.full_name,
            checkSuite: checkSuite.id,
            conclusion: checkSuite.conclusion,
            headBranch: checkSuite.head_branch
          }
        });
      } else {
        // Log the specific reason why PR review was not triggered
        const reasons = [];
        if (checkSuite.conclusion !== 'success') {
          reasons.push(`conclusion is '${checkSuite.conclusion}' (not 'success')`);
        }
        if (!checkSuite.pull_requests || checkSuite.pull_requests.length === 0) {
          reasons.push('no pull requests associated with check suite');
        }

        logger.info(
          {
            repo: repo.full_name,
            checkSuite: checkSuite.id,
            conclusion: checkSuite.conclusion,
            pullRequestCount: checkSuite.pull_requests?.length || 0,
            reasons: reasons.join(', ')
          },
          'Check suite completed but not triggering PR review'
        );
      }
    }

    // Handle pull request comment events
    if (
      (event === 'pull_request_review_comment' || event === 'pull_request') &&
      payload.action === 'created'
    ) {
      const pr = payload.pull_request;
      const repo = payload.repository;
      const comment = payload.comment || payload.pull_request.body;

      logger.info(
        {
          repo: repo.full_name,
          pr: pr.number,
          user: payload.sender.login
        },
        'Processing pull request comment'
      );

      // Check if comment mentions the bot
      if (comment && typeof comment === 'string' && comment.includes(BOT_USERNAME)) {
        logger.info(
          {
            repo: repo.full_name,
            pr: pr.number,
            branch: pr.head.ref
          },
          `Processing ${BOT_USERNAME} mention in PR`
        );

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
            logger.error(
              {
                errorId,
                timestamp,
                error: error.message,
                stack: error.stack,
                repo: repo.full_name,
                pr: pr.number,
                command: command
              },
              'Error processing PR command (with reference ID for correlation)'
            );

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
    logger.error(
      {
        errorId,
        timestamp,
        err: {
          message: error.message,
          stack: error.stack
        }
      },
      'Error handling webhook (with error reference)'
    );

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
