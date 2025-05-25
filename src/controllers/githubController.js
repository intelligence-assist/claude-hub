const crypto = require('crypto');
const claudeService = require('../services/claudeService');
const githubService = require('../services/githubService');
const { createLogger } = require('../utils/logger');
const { sanitizeBotMentions, sanitizeLabels } = require('../utils/sanitize');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('githubController');

// In-memory deduplication cache with TTL for race condition prevention
const reviewCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired entries every minute (only in production)
let cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of reviewCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        reviewCache.delete(key);
      }
    }
  }, 60000);
}

// Export cleanup function for tests
function cleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  reviewCache.clear();
}

/**
 * Attempts to acquire a lock for processing a PR review to prevent race conditions
 * @param {string} repoFullName - Repository full name
 * @param {number} prNumber - Pull request number  
 * @param {string} commitSha - Commit SHA
 * @param {string} requestId - Unique request identifier
 * @returns {Object} { acquired: boolean, cacheKey: string, existing?: Object }
 */
function tryAcquireReviewLock(repoFullName, prNumber, commitSha, requestId) {
  const cacheKey = createHash('sha256')
    .update(`${repoFullName}:pr:${prNumber}:${commitSha}`)
    .digest('hex');

  const existing = reviewCache.get(cacheKey);
  const now = Date.now();

  if (existing) {
    if (existing.status === 'processing') {
      // Review in progress
      return { acquired: false, cacheKey, existing };
    }
    
    if (existing.status === 'completed') {
      // Review already completed  
      return { acquired: false, cacheKey, existing };
    }
  }

  // Acquire lock
  reviewCache.set(cacheKey, {
    status: 'processing',
    timestamp: now,
    requestId,
    repoFullName,
    prNumber,
    commitSha
  });

  return { acquired: true, cacheKey };
}

/**
 * Marks a review as completed in the cache
 * @param {string} cacheKey - Cache key from tryAcquireReviewLock
 * @param {Object} result - Review result
 */
function markReviewCompleted(cacheKey, result) {
  const existing = reviewCache.get(cacheKey);
  if (existing) {
    reviewCache.set(cacheKey, {
      ...existing,
      status: 'completed',
      timestamp: Date.now(),
      result
    });
  }
}

/**
 * Marks a review as failed and removes from cache to allow retry
 * @param {string} cacheKey - Cache key from tryAcquireReviewLock
 */
function markReviewFailed(cacheKey) {
  reviewCache.delete(cacheKey);
}

/**
 * Create hash function (crypto.createHash abstraction)
 */
function createHash(algorithm) {
  return crypto.createHash(algorithm);
}

/**
 * Clear the review cache - useful for testing
 */
function clearReviewCache() {
  reviewCache.clear();
}

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
      if (
        checkSuite.conclusion === 'success' &&
        checkSuite.pull_requests &&
        checkSuite.pull_requests.length > 0
      ) {
        try {
          // Process PRs in parallel for better performance
          const prPromises = checkSuite.pull_requests.map(async pr => {
            const prResult = {
              prNumber: pr.number,
              success: false,
              error: null,
              skippedReason: null
            };
            
            let lockResult = null; // Track cache lock for cleanup

            try {
              // Extract SHA from PR data first, only fall back to check suite SHA if absolutely necessary
              const commitSha = pr.head?.sha;

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

              // Note: We rely on the check_suite conclusion being 'success'
              // which already indicates all checks have passed.
              // The Combined Status API (legacy) won't show results for
              // modern GitHub Actions check runs.

              // Enhanced deduplication: check both in-memory cache and GitHub
              const requestId = `${checkSuite.id}-${pr.number}`;
              lockResult = tryAcquireReviewLock(repo.full_name, pr.number, commitSha, requestId);

              if (!lockResult.acquired) {
                const reason = lockResult.existing.status === 'processing' 
                  ? 'Review already in progress' 
                  : 'Review already completed';
                
                logger.info(
                  {
                    repo: repo.full_name,
                    pr: pr.number,
                    commitSha: commitSha,
                    cacheStatus: lockResult.existing.status,
                    originalRequestId: lockResult.existing.requestId,
                    currentRequestId: requestId
                  },
                  'PR review request deduplicated - ' + reason
                );
                prResult.skippedReason = reason;
                return prResult;
              }

              // Double-check with GitHub API as backup
              const alreadyReviewed = await githubService.hasReviewedPRAtCommit({
                repoOwner: repo.owner.login,
                repoName: repo.name,
                prNumber: pr.number,
                commitSha: commitSha
              });

              if (alreadyReviewed) {
                markReviewCompleted(lockResult.cacheKey, { source: 'github_check' });
                logger.info(
                  {
                    repo: repo.full_name,
                    pr: pr.number,
                    commitSha: commitSha
                  },
                  'PR already reviewed at this commit (GitHub check) - skipping duplicate review'
                );
                prResult.skippedReason = 'Already reviewed at this commit';
                return prResult;
              }

              // Add "review-in-progress" label
              try {
                await githubService.managePRLabels({
                  repoOwner: repo.owner.login,
                  repoName: repo.name,
                  prNumber: pr.number,
                  labelsToAdd: ['claude-review-in-progress'],
                  labelsToRemove: ['claude-review-needed', 'claude-review-complete']
                });
              } catch (labelError) {
                logger.error(
                  {
                    err: labelError.message,
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
              const prReviewPrompt = `# GitHub PR Review - Complete Automated Review

## Initial Setup & Data Collection

### 1. Get PR Overview and Commit Information
\`\`\`bash
# Get basic PR information including title, body, and comments
gh pr view ${pr.number} --json title,body,additions,deletions,changedFiles,files,headRefOid,comments

# Get detailed file information  
gh pr view ${pr.number} --json files --jq '.files[] | {filename: .filename, additions: .additions, deletions: .deletions, status: .status}'

# Get the latest commit ID (required for inline comments)
COMMIT_ID=$(gh pr view ${pr.number} --json headRefOid --jq -r '.headRefOid')
\`\`\`

### 2. Examine Changes
\`\`\`bash
# Get the full diff
gh pr diff ${pr.number}

# Get diff for specific files if needed
# gh pr diff ${pr.number} -- path/to/specific/file.ext
\`\`\`

### 3. Examine Individual Files
\`\`\`bash
# Get list of changed files
CHANGED_FILES=$(gh pr view ${pr.number} --json files --jq -r '.files[].filename')

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
gh pr comment ${pr.number} --body "Your overall assessment here"
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
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${pr.number}/comments \\
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
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${pr.number}/comments \\
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
  /repos/\${OWNER}/\${REPO_NAME}/pulls/${pr.number}/reviews \\
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

              // Update label to show review is complete
              try {
                await githubService.managePRLabels({
                  repoOwner: repo.owner.login,
                  repoName: repo.name,
                  prNumber: pr.number,
                  labelsToAdd: ['claude-review-complete'],
                  labelsToRemove: ['claude-review-in-progress', 'claude-review-needed']
                });
              } catch (labelError) {
                logger.error(
                  {
                    err: labelError.message,
                    repo: repo.full_name,
                    pr: pr.number
                  },
                  'Failed to update review-complete label'
                );
                // Don't fail the review if label update fails
              }

              // Mark review as completed in cache
              markReviewCompleted(lockResult.cacheKey, { 
                source: 'claude_review',
                responseLength: claudeResponse ? claudeResponse.length : 0 
              });

              prResult.success = true;
              return prResult;
            } catch (reviewError) {
              logger.error(
                {
                  errorMessage: reviewError.message || 'Unknown error',
                  errorType: reviewError.constructor.name,
                  repo: repo.full_name,
                  pr: pr.number,
                  checkSuite: checkSuite.id
                },
                'Error processing automated PR review'
              );

              // Remove in-progress label on error
              try {
                await githubService.managePRLabels({
                  repoOwner: repo.owner.login,
                  repoName: repo.name,
                  prNumber: pr.number,
                  labelsToRemove: ['claude-review-in-progress']
                });
              } catch (labelError) {
                logger.error(
                  {
                    err: labelError.message,
                    repo: repo.full_name,
                    pr: pr.number
                  },
                  'Failed to remove review-in-progress label after error'
                );
              }

              // Mark review as failed in cache (remove to allow retry)
              markReviewFailed(lockResult.cacheKey);

              prResult.error = reviewError.message || 'Unknown error during review';
              return prResult;
            }
          });

          // Wait for all PR reviews to complete
          const results = await Promise.allSettled(prPromises);
          const prResults = results.map(result =>
            result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
          );

          // Count successes and failures (mutually exclusive)
          const successCount = prResults.filter(r => r.success).length;
          const failureCount = prResults.filter(
            r => !r.success && r.error && !r.skippedReason
          ).length;
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

          // Return detailed status
          return res.status(200).json({
            success: true,
            message: `Check suite processed: ${successCount} reviewed, ${failureCount} failed, ${skippedCount} skipped`,
            context: {
              repo: repo.full_name,
              checkSuite: checkSuite.id,
              conclusion: checkSuite.conclusion,
              results: prResults
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
  handleWebhook,
  clearReviewCache,
  cleanup
};
