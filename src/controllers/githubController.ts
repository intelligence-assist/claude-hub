import crypto from 'crypto';
import { processCommand } from '../services/claudeService';
import {
  postComment,
  addLabelsToIssue,
  getFallbackLabels,
  hasReviewedPRAtCommit,
  getCheckSuitesForRef,
  managePRLabels
} from '../services/githubService';
import { createLogger } from '../utils/logger';
import { sanitizeBotMentions } from '../utils/sanitize';
import type {
  WebhookHandler,
  WebhookRequest,
  WebhookResponse,
  ErrorResponse
} from '../types/express';
import type {
  GitHubWebhookPayload,
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubCheckSuite,
  GitHubRepository
} from '../types/github';
import type { Response } from 'express';

const logger = createLogger('githubController');

// Get bot username from environment variables - required
const BOT_USERNAME_ENV = process.env['BOT_USERNAME'];

// Validate bot username is set to prevent accidental infinite loops
if (!BOT_USERNAME_ENV) {
  logger.error(
    'BOT_USERNAME environment variable is not set. This is required to prevent infinite loops.'
  );
  throw new Error('BOT_USERNAME environment variable is required');
}

const BOT_USERNAME: string = BOT_USERNAME_ENV;

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
function verifyWebhookSignature(req: WebhookRequest): boolean {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    logger.warn('No signature found in webhook request');
    throw new Error('No signature found in request');
  }

  logger.debug(
    {
      signature: signature,
      secret: process.env['GITHUB_WEBHOOK_SECRET'] ? '[SECRET REDACTED]' : 'missing'
    },
    'Verifying webhook signature'
  );

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('GITHUB_WEBHOOK_SECRET not found in environment');
    throw new Error('Webhook secret not configured');
  }

  const payload = req.rawBody ?? JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const calculatedSignature = 'sha256=' + hmac.update(payload).digest('hex');

  logger.debug('Webhook signature verification completed');

  // Skip verification if in test mode
  if (process.env['NODE_ENV'] === 'test' || process.env['SKIP_WEBHOOK_VERIFICATION'] === '1') {
    logger.warn('Skipping webhook signature verification (test mode)');
    return true;
  }

  // Properly verify the signature using timing-safe comparison
  // Check lengths first to avoid timingSafeEqual error with different-length buffers
  if (
    signature.length === calculatedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature))
  ) {
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
export const handleWebhook: WebhookHandler = async (req, res) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    // Log webhook receipt with key details (sanitize user input to prevent log injection)
    logger.info(
      {
        event,
        delivery,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        sender: req.body.sender?.login?.replace(/[\r\n\t]/g, '_') || 'unknown',
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        repo: req.body.repository?.full_name?.replace(/[\r\n\t]/g, '_') || 'unknown'
      },
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      `Received GitHub ${event?.replace(/[\r\n\t]/g, '_') || 'unknown'} webhook`
    );

    // Verify the webhook signature
    try {
      verifyWebhookSignature(req);
    } catch (error) {
      const err = error as Error;
      logger.warn({ err: err }, 'Webhook verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature', message: err.message });
    }

    const payload = req.body;

    // Handle issues being opened for auto-tagging
    if (event === 'issues' && payload.action === 'opened') {
      return await handleIssueOpened(payload, res);
    }

    // Handle issue comment events
    if (event === 'issue_comment' && payload.action === 'created') {
      return await handleIssueComment(payload, res);
    }

    // Handle check suite completion for automated PR review
    if (event === 'check_suite' && payload.action === 'completed') {
      return await handleCheckSuiteCompleted(payload, res);
    }

    // Handle pull request comment events
    if (
      (event === 'pull_request_review_comment' || event === 'pull_request') &&
      payload.action === 'created'
    ) {
      return await handlePullRequestComment(payload, res);
    }

    logger.info({ event }, 'Webhook processed successfully');
    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    return handleWebhookError(error, res);
  }
};

/**
 * Handle issue opened events for auto-tagging
 */
async function handleIssueOpened(
  payload: GitHubWebhookPayload,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  const issue = payload.issue;
  const repo = payload.repository;

  if (!issue) {
    logger.error('Issue data is missing from payload');
    return res.status(400).json({
      error: 'Issue data is missing from payload'
    });
  }

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
    // Process the issue with Claude for automatic tagging using CLI-based approach
    const tagCommand = `Analyze this GitHub issue and apply appropriate labels using GitHub CLI commands.

Issue Details:
- Title: ${issue.title}
- Description: ${issue.body ?? 'No description provided'}
- Issue Number: ${issue.number}

Instructions:
1. First run 'gh label list' to see what labels are available in this repository
2. Analyze the issue content to determine appropriate labels from these categories:
   - Priority: critical, high, medium, low  
   - Type: bug, feature, enhancement, documentation, question, security
   - Complexity: trivial, simple, moderate, complex
   - Component: api, frontend, backend, database, auth, webhook, docker
3. Apply the labels using: gh issue edit ${issue.number} --add-label "label1,label2,label3"
4. Do NOT comment on the issue - only apply labels silently

Complete the auto-tagging task using only GitHub CLI commands.`;

    logger.info('Sending issue to Claude for CLI-based auto-tagging');
    const claudeResponse = await processCommand({
      repoFullName: repo.full_name,
      issueNumber: issue.number,
      command: tagCommand,
      isPullRequest: false,
      branchName: null,
      operationType: 'auto-tagging'
    });

    // With CLI-based approach, Claude handles the labeling directly
    // Check if the response indicates success or if we need fallback
    if (claudeResponse.includes('error') || claudeResponse.includes('failed')) {
      logger.warn(
        {
          repo: repo.full_name,
          issue: issue.number,
          responsePreview: claudeResponse.substring(0, 200)
        },
        'Claude CLI tagging may have failed, attempting fallback'
      );

      // Fall back to basic tagging based on keywords
      const fallbackLabels = getFallbackLabels(issue.title, issue.body);
      if (fallbackLabels.length > 0) {
        await addLabelsToIssue({
          repoOwner: repo.owner.login,
          repoName: repo.name,
          issueNumber: issue.number,
          labels: fallbackLabels
        });
        logger.info('Applied fallback labels successfully');
      }
    } else {
      logger.info(
        {
          repo: repo.full_name,
          issue: issue.number,
          responseLength: claudeResponse.length
        },
        'Auto-tagging completed with CLI approach'
      );
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
    const err = error as Error;
    logger.error(
      {
        errorMessage: err.message || 'Unknown error',
        errorType: err.constructor.name
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

/**
 * Handle issue comment events
 */
async function handleIssueComment(
  payload: GitHubWebhookPayload,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  const comment = payload.comment;
  const issue = payload.issue;
  const repo = payload.repository;

  if (!comment || !issue) {
    logger.error('Comment or issue data is missing from payload');
    return res.status(400).json({
      error: 'Comment or issue data is missing from payload'
    });
  }

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
    return await processBotMention(comment, issue, repo, res);
  }

  return res.status(200).json({ message: 'Webhook processed successfully' });
}

/**
 * Handle pull request comment events
 */
async function handlePullRequestComment(
  payload: GitHubWebhookPayload,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  const pr = payload.pull_request;
  const repo = payload.repository;
  const comment = payload.comment ?? {
    body: payload.pull_request?.body ?? '',
    user: payload.sender
  };

  if (!pr) {
    logger.error('Pull request data is missing from payload');
    return res.status(400).json({
      error: 'Pull request data is missing from payload'
    });
  }

  logger.info(
    {
      repo: repo.full_name,
      pr: pr.number,
      user: payload.sender.login
    },
    'Processing pull request comment'
  );

  // Check if comment mentions the bot
  if (typeof comment.body === 'string' && comment.body.includes(BOT_USERNAME)) {
    logger.info(
      {
        repo: repo.full_name,
        pr: pr.number,
        branch: pr.head.ref
      },
      `Processing ${BOT_USERNAME} mention in PR`
    );

    // Extract the command for Claude
    const escapedUsername = BOT_USERNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`${escapedUsername}\\s+(.*)`, 's');
    const commandMatch = comment.body.match(mentionRegex);
    if (commandMatch?.[1]) {
      const command = commandMatch[1].trim();

      try {
        // Process the command with Claude
        logger.info('Sending command to Claude service');
        const claudeResponse = await processCommand({
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
        return handleCommandError(error, { repo, issue: { number: pr.number }, command }, res);
      }
    }
  }

  return res.status(200).json({ message: 'Webhook processed successfully' });
}

/**
 * Process bot mentions in comments
 */
async function processBotMention(
  comment: GitHubComment,
  issue: GitHubIssue | GitHubPullRequest,
  repo: GitHubRepository,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  // Check if the comment author is authorized
  const authorizedUsers = process.env.AUTHORIZED_USERS
    ? process.env.AUTHORIZED_USERS.split(',').map(user => user.trim())
    : [process.env.DEFAULT_AUTHORIZED_USER ?? 'admin'];
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
      const errorMessage = sanitizeBotMentions(
        `❌ Sorry @${commentAuthor}, only authorized users can trigger Claude commands.`
      );

      await postComment({
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
  const escapedUsername = BOT_USERNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRegex = new RegExp(`${escapedUsername}\\s+(.*)`, 's');
  const commandMatch = comment.body.match(mentionRegex);

  if (commandMatch?.[1]) {
    const command = commandMatch[1].trim();

    try {
      // Process the command with Claude
      logger.info('Sending command to Claude service');
      const claudeResponse = await processCommand({
        repoFullName: repo.full_name,
        issueNumber: issue.number,
        command: command,
        isPullRequest: false,
        branchName: null
      });

      // Post Claude's response as a comment on the issue
      logger.info('Posting Claude response as GitHub comment');
      await postComment({
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
      return handleCommandError(error, { repo, issue, command }, res);
    }
  }

  return res.status(200).json({ message: 'Webhook processed successfully' });
}

/**
 * Handle command processing errors
 */
function handleCommandError(
  error: unknown,
  context: {
    repo: GitHubRepository;
    issue: { number: number };
    command: string;
  },
  res: Response<WebhookResponse | ErrorResponse>
): Response<WebhookResponse | ErrorResponse> {
  const err = error as Error;
  logger.error({ err: err }, 'Error processing Claude command');

  // Try to post an error comment
  const handleErrorComment = async () => {
    try {
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
          error: err.message,
          stack: err.stack,
          repo: context.repo.full_name,
          issue: context.issue.number,
          command: context.command
        },
        'Error processing command (with reference ID for correlation)'
      );

      await postComment({
        repoOwner: context.repo.owner.login,
        repoName: context.repo.name,
        issueNumber: context.issue.number,
        body: errorMessage
      });
    } catch (commentError) {
      logger.error({ err: commentError }, 'Failed to post error comment');
    }
  };

  // Don't await the error comment posting to avoid blocking the response
  handleErrorComment().catch(() => {
    // Intentionally ignore errors in error comment posting
  });

  return res.status(500).json({
    success: false,
    error: 'Failed to process command',
    message: err.message,
    context: {
      repo: context.repo.full_name,
      issue: context.issue.number,
      type: 'command_error'
    }
  });
}

/**
 * Handle check suite completion for automated PR review
 */
async function handleCheckSuiteCompleted(
  payload: GitHubWebhookPayload,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  const checkSuite = payload.check_suite;
  const repo = payload.repository;

  if (!checkSuite) {
    logger.error('Check suite data is missing from payload');
    return res.status(400).json({
      error: 'Check suite data is missing from payload'
    });
  }

  logger.info(
    {
      repo: repo.full_name,
      checkSuiteId: checkSuite.id,
      conclusion: checkSuite.conclusion,
      status: checkSuite.status,
      headBranch: checkSuite.head_branch,
      headSha: checkSuite.head_sha,
      appName: checkSuite.app?.name,
      appSlug: checkSuite.app?.slug,
      pullRequestCount: checkSuite.pull_requests ? checkSuite.pull_requests.length : 0,
      pullRequests: checkSuite.pull_requests?.map(pr => ({
        number: pr.number,
        headRef: pr.head.ref,
        headSha: pr.head.sha
      }))
    },
    'Processing check_suite completed event'
  );

  // Skip if this check suite failed or was cancelled
  if (checkSuite.conclusion !== 'success') {
    logger.info(
      {
        repo: repo.full_name,
        checkSuite: checkSuite.id,
        conclusion: checkSuite.conclusion
      },
      'Check suite did not succeed - skipping PR review trigger'
    );
    return res.status(200).json({ message: 'Check suite not successful' });
  }

  // Skip if no pull requests are associated
  if (!checkSuite.pull_requests || checkSuite.pull_requests.length === 0) {
    logger.warn(
      {
        repo: repo.full_name,
        checkSuite: checkSuite.id,
        headBranch: checkSuite.head_branch
      },
      'Check suite succeeded but no pull requests found in payload - possible fork PR'
    );
    return res.status(200).json({ message: 'No pull requests associated with check suite' });
  }

  // Check if we should wait for all check suites or use a specific trigger
  const triggerWorkflowName = process.env.PR_REVIEW_TRIGGER_WORKFLOW;
  const waitForAllChecks = process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS === 'true';

  let shouldTriggerReview = false;
  let triggerReason = '';

  if (waitForAllChecks || !triggerWorkflowName) {
    // Check if all check suites for the PR are complete and successful
    const allChecksPassed = await checkAllCheckSuitesComplete({
      repo,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      pullRequests: checkSuite.pull_requests ?? []
    });

    shouldTriggerReview = allChecksPassed;
    triggerReason = allChecksPassed
      ? 'All check suites passed'
      : 'Waiting for other check suites to complete';
  } else {
    // Use specific workflow trigger
    const workflowName = getWorkflowNameFromCheckSuite(checkSuite, repo);

    // For GitHub Actions, we need to check the actual workflow name
    const effectiveWorkflowName =
      workflowName === 'GitHub Actions' ? triggerWorkflowName : workflowName;

    shouldTriggerReview = effectiveWorkflowName === triggerWorkflowName;
    triggerReason = shouldTriggerReview
      ? `Triggered by workflow: ${triggerWorkflowName}`
      : `Workflow '${workflowName}' does not match trigger '${triggerWorkflowName}'`;
  }

  logger.info(
    {
      repo: repo.full_name,
      checkSuite: checkSuite.id,
      conclusion: checkSuite.conclusion,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      pullRequestCount: (checkSuite.pull_requests ?? []).length,
      shouldTriggerReview,
      triggerReason,
      waitForAllChecks,
      triggerWorkflowName
    },
    shouldTriggerReview ? 'Triggering automated PR review' : 'Not triggering PR review'
  );

  // Only proceed if we should trigger the review
  if (shouldTriggerReview) {
    return await processAutomatedPRReviews(checkSuite, repo, res);
  }

  return res.status(200).json({ message: 'Webhook processed successfully' });
}

/**
 * Process automated PR reviews for successful check suites
 */
async function processAutomatedPRReviews(
  checkSuite: GitHubCheckSuite,
  repo: GitHubRepository,
  res: Response<WebhookResponse | ErrorResponse>
): Promise<Response<WebhookResponse | ErrorResponse>> {
  try {
    // Process PRs in parallel for better performance
    const prPromises = (checkSuite.pull_requests ?? []).map(async pr => {
      const prResult = {
        prNumber: pr.number,
        success: false,
        error: null as string | null,
        skippedReason: null as string | null
      };

      try {
        // Extract SHA from PR data first
        const commitSha = pr.head.sha;

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
            'No commit SHA available for PR - cannot verify status'
          );
          prResult.skippedReason = 'No commit SHA available';
          prResult.error = 'Missing PR head SHA';
          return prResult;
        }

        // Check if we've already reviewed this PR at this commit
        const alreadyReviewed = await hasReviewedPRAtCommit({
          repoOwner: repo.owner.login,
          repoName: repo.name,
          prNumber: pr.number,
          commitSha: commitSha
        });

        if (alreadyReviewed) {
          logger.info(
            {
              repo: repo.full_name,
              pr: pr.number,
              commitSha: commitSha
            },
            'PR already reviewed at this commit - skipping duplicate review'
          );
          prResult.skippedReason = 'Already reviewed at this commit';
          return prResult;
        }

        // Add "review-in-progress" label
        try {
          await managePRLabels({
            repoOwner: repo.owner.login,
            repoName: repo.name,
            prNumber: pr.number,
            labelsToAdd: ['claude-review-in-progress'],
            labelsToRemove: ['claude-review-needed', 'claude-review-complete']
          });
        } catch (labelError) {
          logger.error(
            {
              err: (labelError as Error).message,
              repo: repo.full_name,
              pr: pr.number
            },
            'Failed to add review-in-progress label'
          );
          // Continue with review even if label fails
        }

        logger.info(
          {
            repo: repo.full_name,
            pr: pr.number,
            checkSuite: checkSuite.id,
            conclusion: checkSuite.conclusion,
            commitSha: commitSha
          },
          'All checks passed - triggering automated PR review'
        );

        // Create the PR review prompt
        const prReviewPrompt = createPRReviewPrompt(pr.number, repo.full_name, commitSha);

        // Process the PR review with Claude
        logger.info('Sending PR for automated Claude review');
        const claudeResponse = await processCommand({
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

        // Update label to show review is complete
        try {
          await managePRLabels({
            repoOwner: repo.owner.login,
            repoName: repo.name,
            prNumber: pr.number,
            labelsToAdd: ['claude-review-complete'],
            labelsToRemove: ['claude-review-in-progress', 'claude-review-needed']
          });
        } catch (labelError) {
          logger.error(
            {
              err: (labelError as Error).message,
              repo: repo.full_name,
              pr: pr.number
            },
            'Failed to update review-complete label'
          );
          // Don't fail the review if label update fails
        }

        prResult.success = true;
        return prResult;
      } catch (reviewError) {
        logger.error(
          {
            errorMessage: (reviewError as Error).message || 'Unknown error',
            errorType: (reviewError as Error).constructor.name,
            repo: repo.full_name,
            pr: pr.number,
            checkSuite: checkSuite.id
          },
          'Error processing automated PR review'
        );

        // Remove in-progress label on error
        try {
          await managePRLabels({
            repoOwner: repo.owner.login,
            repoName: repo.name,
            prNumber: pr.number,
            labelsToRemove: ['claude-review-in-progress']
          });
        } catch (labelError) {
          logger.error(
            {
              err: (labelError as Error).message,
              repo: repo.full_name,
              pr: pr.number
            },
            'Failed to remove review-in-progress label after error'
          );
        }

        prResult.error = (reviewError as Error).message || 'Unknown error during review';
        return prResult;
      }
    });

    // Wait for all PR reviews to complete
    const results = await Promise.allSettled(prPromises);
    const prResults = results.map(result =>
      result.status === 'fulfilled'
        ? result.value
        : { success: false, error: (result.reason as Error).message, skippedReason: null }
    );

    // Count successes and failures
    const successCount = prResults.filter(r => r.success).length;
    const failureCount = prResults.filter(r => !r.success && r.error && !r.skippedReason).length;
    const skippedCount = prResults.filter(r => !r.success && r.skippedReason).length;

    logger.info(
      {
        repo: repo.full_name,
        checkSuite: checkSuite.id,
        totalPRs: prResults.length,
        successCount,
        failureCount,
        skippedCount,
        results: prResults
      },
      'Check suite PR review processing completed'
    );

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error(
      {
        err: err,
        repo: repo.full_name,
        checkSuite: checkSuite.id
      },
      'Error processing check suite for PR reviews'
    );

    return res.status(500).json({
      success: false,
      error: 'Failed to process check suite',
      message: err.message,
      context: {
        repo: repo.full_name,
        checkSuite: checkSuite.id,
        type: 'check_suite'
      }
    });
  }
}

/**
 * Create PR review prompt
 */
function createPRReviewPrompt(prNumber: number, repoFullName: string, commitSha: string): string {
  return `# GitHub PR Review - Complete Automated Review

## Initial Setup & Data Collection

### 1. Get PR Overview and Commit Information
\`\`\`bash
# Get basic PR information including title, body, and comments
gh pr view ${prNumber} --json title,body,additions,deletions,changedFiles,files,headRefOid,comments

# Get detailed file information  
gh pr view ${prNumber} --json files --jq '.files[] | {filename: .filename, additions: .additions, deletions: .deletions, status: .status}'

# Get the latest commit ID (required for inline comments)
COMMIT_ID=$(gh pr view ${prNumber} --json headRefOid --jq -r '.headRefOid')
\`\`\`

### 2. Examine Changes
\`\`\`bash
# Get the full diff
gh pr diff ${prNumber}

# Get diff for specific files if needed
# gh pr diff ${prNumber} -- path/to/specific/file.ext
\`\`\`

### 3. Examine Individual Files
\`\`\`bash
# Get list of changed files
CHANGED_FILES=$(gh pr view ${prNumber} --json files --jq -r '.files[].filename')

# Read specific files as needed
for file in $CHANGED_FILES; do
    echo "=== $file ==="
    cat "$file"
done
\`\`\`

## Automated Review Process

### 4. Repository and Owner Detection
\`\`\`bash
# Get repository information
REPO_INFO=$(gh repo view --json owner,name)
OWNER=$(echo $REPO_INFO | jq -r '.owner.login')
REPO_NAME=$(echo $REPO_INFO | jq -r '.name')
\`\`\`

## Comment Creation Methods

### Method 1: General PR Comments (Use for overall assessment)
\`\`\`bash
# Add general comment to PR conversation
gh pr comment ${prNumber} --body "Your overall assessment here"
\`\`\`

### Method 2: Inline Comments (Use for specific line feedback)

**CRITICAL**: Inline comments require the GitHub REST API via \`gh api\` command.

#### For Single Line Comments:
\`\`\`bash
# Create inline comment on specific line
gh api \\
  --method POST \\
  -H "Accept: application/vnd.github+json" \\
  -H "X-GitHub-Api-Version: 2022-11-28" \\
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${prNumber}/comments \\
  -f body="Your comment here" \\
  -f commit_id="\${COMMIT_ID}" \\
  -f path="src/main.js" \\
  -F line=42 \\
  -f side="RIGHT"
\`\`\`

#### For Multi-Line Comments (Line Range):
\`\`\`bash
# Create comment spanning multiple lines
gh api \\
  --method POST \\
  -H "Accept: application/vnd.github+json" \\
  -H "X-GitHub-Api-Version: 2022-11-28" \\
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${prNumber}/comments \\
  -f body="Your comment here" \\
  -f commit_id="\${COMMIT_ID}" \\
  -f path="src/utils.js" \\
  -F start_line=15 \\
  -F line=25 \\
  -f side="RIGHT"
\`\`\`

### Method 3: Comprehensive Review Submission
\`\`\`bash
# Submit complete review with multiple inline comments + overall assessment
gh api \\
  --method POST \\
  -H "Accept: application/vnd.github+json" \\
  -H "X-GitHub-Api-Version: 2022-11-28" \\
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${prNumber}/reviews \\
  -f commit_id="\${COMMIT_ID}" \\
  -f body="Overall review summary here" \\
  -f event="REQUEST_CHANGES" \\
  -f comments='[
    {
      "path": "file1.js",
      "line": 23,
      "body": "Comment text"
    },
    {
      "path": "file2.js", 
      "line": 15,
      "body": "Another comment"
    }
  ]'
\`\`\`

## Review Guidelines

### Review Event Types:
- \`APPROVE\`: Approve the PR
- \`REQUEST_CHANGES\`: Request changes before merge
- \`COMMENT\`: Provide feedback without approval/rejection

### Review Focus Areas by File Type

#### Workflow Files (.github/workflows/*.yml)
- **Trigger conditions** and branch targeting
- **Security**: \`secrets\` usage, \`pull_request_target\` risks  
- **Performance**: Unnecessary job runs, caching opportunities
- **Dependencies**: Job interdependencies and failure handling

#### Code Files (*.js, *.py, etc.)
- **Security vulnerabilities** (injection, XSS, auth)
- **Logic errors** and edge cases
- **Performance** issues
- **Code organization** and maintainability

#### Configuration Files (*.json, *.yaml, *.toml)
- **Security**: Exposed secrets or sensitive data
- **Syntax** and structural validity
- **Environment-specific** settings

### Quality Gates

#### Must Address (REQUEST_CHANGES):
- Security vulnerabilities
- Breaking changes
- Critical logic errors
- Workflow infinite loops or failures

#### Should Address (COMMENT):
- Performance improvements  
- Code organization
- Missing error handling
- Documentation gaps

#### Nice to Have (APPROVE with comments):
- Code style preferences
- Minor optimizations
- Suggestions for future iterations

## Multi-File Output Strategy

### For Small PRs (1-3 files, <50 changes):
Create a single comprehensive review comment with all feedback.

### For Medium PRs (4-10 files, 50-200 changes):
1. Create inline comments for specific issues
2. Create a summary review comment

### For Large PRs (10+ files, 200+ changes):
1. Create inline comments for critical issues
2. Group related feedback by component/area
3. Create a comprehensive summary review

## Important Instructions

1. **Always start by examining the PR title, body, and any existing comments** to understand context
2. **Use inline comments for specific code issues** - they're more actionable
3. **Group related issues** in your review to avoid comment spam
4. **Be constructive** - explain why something is an issue and suggest solutions
5. **Prioritize critical issues** - security, breaking changes, logic errors
6. **Complete your review** with an appropriate event type (APPROVE, REQUEST_CHANGES, or COMMENT)
7. **Include commit SHA** - Always include "Reviewed at commit: ${commitSha}" in your final review comment

Please perform a comprehensive review of PR #${prNumber} in repository ${repoFullName}.`;
}

/**
 * Checks if all meaningful check suites for a PR are complete and successful
 */
async function checkAllCheckSuitesComplete({
  repo,
  pullRequests
}: {
  repo: GitHubRepository;
  pullRequests: GitHubPullRequest[];
}): Promise<boolean> {
  const debounceDelayMs = parseInt(process.env.PR_REVIEW_DEBOUNCE_MS ?? '5000', 10);
  const maxWaitTimeMs = parseInt(process.env.PR_REVIEW_MAX_WAIT_MS ?? '1800000', 10);
  const conditionalJobTimeoutMs = parseInt(
    process.env.PR_REVIEW_CONDITIONAL_TIMEOUT_MS ?? '300000',
    10
  );

  try {
    // Add a small delay to account for GitHub's eventual consistency
    await new Promise(resolve => setTimeout(resolve, debounceDelayMs));

    // Check each PR's status
    for (const pr of pullRequests) {
      try {
        const [repoOwner, repoName] = repo.full_name.split('/');
        const checkSuitesResponse = await getCheckSuitesForRef({
          repoOwner,
          repoName,
          ref: pr.head.sha
        });

        const checkSuites = checkSuitesResponse.check_suites;
        const now = Date.now();

        logger.info(
          {
            repo: repo.full_name,
            pr: pr.number,
            sha: pr.head.sha,
            totalCheckSuites: checkSuites.length,
            checkSuites: checkSuites.map(cs => ({
              id: cs.id,
              app: cs.app?.name,
              status: cs.status,
              conclusion: cs.conclusion,
              createdAt: cs.created_at,
              updatedAt: cs.updated_at
            }))
          },
          'Retrieved check suites for PR'
        );

        // Categorize check suites for smarter processing
        const meaningfulSuites: GitHubCheckSuite[] = [];
        const skippedSuites: Array<{
          id: number;
          app?: string;
          conclusion: string;
          reason: string;
        }> = [];
        const timeoutSuites: Array<{
          id: number;
          app?: string;
          reason: string;
          ageMs: number;
          stalenessMs: number;
          status?: string;
        }> = [];

        for (const suite of checkSuites) {
          const createdTime = new Date(suite.created_at ?? new Date()).getTime();
          const updatedTime = new Date(suite.updated_at ?? new Date()).getTime();
          const ageMs = now - createdTime;
          const stalenessMs = now - updatedTime;

          // Skip suites that were explicitly skipped or marked neutral
          if (suite.conclusion === 'neutral' || suite.conclusion === 'skipped') {
            skippedSuites.push({
              id: suite.id,
              app: suite.app?.name,
              conclusion: suite.conclusion,
              reason: 'explicitly_skipped'
            });
            continue;
          }

          // Skip suites that never started and are old
          if (suite.status === 'queued' && ageMs > conditionalJobTimeoutMs) {
            timeoutSuites.push({
              id: suite.id,
              app: suite.app?.name,
              status: suite.status,
              ageMs: ageMs,
              stalenessMs: stalenessMs,
              reason: 'conditional_job_timeout'
            });
            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: suite.id,
                app: suite.app?.name,
                ageMs: ageMs,
                conditionalJobTimeoutMs: conditionalJobTimeoutMs
              },
              'Skipping check suite that never started (likely conditional job)'
            );
            continue;
          }

          // Skip empty check suites that have no check runs
          if (suite.status === 'queued' && suite.latest_check_runs_count === 0 && ageMs > 60000) {
            timeoutSuites.push({
              id: suite.id,
              app: suite.app?.name,
              status: suite.status,
              ageMs: ageMs,
              stalenessMs: stalenessMs,
              reason: 'empty_check_suite'
            });
            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: suite.id,
                app: suite.app?.name,
                ageMs: ageMs,
                checkRunsCount: suite.latest_check_runs_count
              },
              'Skipping empty check suite with no check runs (likely misconfigured external app)'
            );
            continue;
          }

          // Skip suites that have been stale for too long
          if (suite.status === 'in_progress' && stalenessMs > maxWaitTimeMs) {
            timeoutSuites.push({
              id: suite.id,
              app: suite.app?.name,
              status: suite.status,
              ageMs: ageMs,
              stalenessMs: stalenessMs,
              reason: 'stale_in_progress'
            });
            logger.warn(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: suite.id,
                app: suite.app?.name,
                stalenessMs: stalenessMs
              },
              'Skipping stale check suite that has been in progress too long'
            );
            continue;
          }

          // This is a meaningful check suite that we should wait for
          meaningfulSuites.push(suite);
        }

        logger.info(
          {
            repo: repo.full_name,
            pr: pr.number,
            totalSuites: checkSuites.length,
            meaningfulSuites: meaningfulSuites.length,
            skippedSuites: skippedSuites.length,
            timeoutSuites: timeoutSuites.length,
            skippedDetails: skippedSuites,
            timeoutDetails: timeoutSuites
          },
          'Categorized check suites for smart processing'
        );

        // If no meaningful suites found, something might be wrong
        if (meaningfulSuites.length === 0) {
          logger.warn(
            {
              repo: repo.full_name,
              pr: pr.number,
              totalSuites: checkSuites.length
            },
            'No meaningful check suites found - all were skipped or timed out'
          );

          // If we only have skipped/neutral suites, consider that as "passed"
          if (
            checkSuites.length > 0 &&
            skippedSuites.length + timeoutSuites.length === checkSuites.length
          ) {
            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number
              },
              'All check suites were skipped/conditional - considering as passed'
            );
            continue; // Move to next PR
          }
          return false;
        }

        // Check meaningful check suites
        for (const suite of meaningfulSuites) {
          // If any meaningful check is still in progress, we should wait
          if (suite.status !== 'completed') {
            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: suite.id,
                app: suite.app?.name,
                status: suite.status
              },
              'Meaningful check suite still in progress'
            );
            return false;
          }

          // If any meaningful check failed, we shouldn't review
          if (suite.conclusion !== 'success') {
            logger.info(
              {
                repo: repo.full_name,
                pr: pr.number,
                checkSuite: suite.id,
                app: suite.app?.name,
                conclusion: suite.conclusion
              },
              'Meaningful check suite did not succeed'
            );
            return false;
          }
        }

        logger.info(
          {
            repo: repo.full_name,
            pr: pr.number,
            passedSuites: meaningfulSuites.length
          },
          'All meaningful check suites completed successfully'
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            repo: repo.full_name,
            pr: pr.number
          },
          'Failed to check PR status'
        );
        return false;
      }
    }

    // All meaningful checks passed!
    logger.info(
      {
        repo: repo.full_name,
        prCount: pullRequests.length
      },
      'All PRs have meaningful check suites completed successfully'
    );
    return true;
  } catch (error) {
    logger.error(
      {
        err: error,
        repo: repo.full_name
      },
      'Failed to check all check suites'
    );
    return false;
  }
}

/**
 * Extract workflow name from check suite
 */
function getWorkflowNameFromCheckSuite(
  checkSuite: GitHubCheckSuite,
  repo: GitHubRepository
): string | null {
  try {
    // Use the app name if it's GitHub Actions
    if (checkSuite.app && checkSuite.app.slug === 'github-actions') {
      return checkSuite.app.name;
    }

    // For other apps, return the app name
    return checkSuite.app ? checkSuite.app.name : null;
  } catch (error) {
    logger.error(
      {
        err: error,
        checkSuiteId: checkSuite.id,
        repo: repo.full_name
      },
      'Failed to extract workflow name from check suite'
    );
    return null;
  }
}

/**
 * Handle general webhook errors
 */
function handleWebhookError(
  error: unknown,
  res: Response<WebhookResponse | ErrorResponse>
): Response<WebhookResponse | ErrorResponse> {
  const err = error as Error;

  // Generate a unique error reference
  const timestamp = new Date().toISOString();
  const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;

  // Log detailed error with reference
  logger.error(
    {
      errorId,
      timestamp,
      err: {
        message: err.message,
        stack: err.stack
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
