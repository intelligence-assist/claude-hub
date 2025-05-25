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

// Configuration for debounced PR reviews
const PR_REVIEW_DEBOUNCE_DELAY = parseInt(process.env.PR_REVIEW_DEBOUNCE_DELAY, 10) || 30000; // 30 seconds default
const debounceTimers = new Map(); // Map of "repo:branch" -> timeout

/**
 * Clears any existing debounce timer for a given repository and branch
 * @param {string} repoFullName - Full repository name (owner/repo)
 * @param {string} branchName - Branch name or SHA
 */
function clearDebounceTimer(repoFullName, branchName) {
  const key = `${repoFullName}:${branchName}`;
  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    debounceTimers.delete(key);
    logger.debug(
      {
        repo: repoFullName,
        branch: branchName,
        key: key
      },
      'Cleared existing debounce timer'
    );
  }
}

/**
 * Sets up a debounced PR review trigger
 * @param {string} repoFullName - Full repository name (owner/repo)
 * @param {string} branchName - Branch name or SHA
 * @param {string} commitSha - Commit SHA that triggered the status
 * @param {Function} reviewCallback - Function to call when debounce period expires
 */
function setupDebouncedReview(repoFullName, branchName, commitSha, reviewCallback) {
  const key = `${repoFullName}:${branchName}`;
  
  // Clear any existing timer for this repo:branch
  clearDebounceTimer(repoFullName, branchName);
  
  logger.info(
    {
      repo: repoFullName,
      branch: branchName,
      commitSha: commitSha,
      delayMs: PR_REVIEW_DEBOUNCE_DELAY,
      key: key
    },
    'Setting up debounced PR review trigger'
  );
  
  // Set new timer
  const timer = setTimeout(async () => {
    try {
      logger.info(
        {
          repo: repoFullName,
          branch: branchName,
          commitSha: commitSha,
          key: key
        },
        'Debounce period expired - triggering PR review'
      );
      
      // Remove timer from map before executing
      debounceTimers.delete(key);
      
      // Execute the review callback
      await reviewCallback();
      
    } catch (error) {
      logger.error(
        {
          err: error,
          repo: repoFullName,
          branch: branchName,
          commitSha: commitSha
        },
        'Error in debounced PR review execution'
      );
    }
  }, PR_REVIEW_DEBOUNCE_DELAY);
  
  // Store timer in map
  debounceTimers.set(key, timer);
}

/**
 * Executes PR review for the specified pull requests
 * @param {Object[]} pullRequests - Array of pull request objects with number, head.ref, head.sha
 * @param {Object} repository - Repository object with full_name, owner.login, name
 * @param {string} triggerContext - Context for logging (e.g., 'check_suite', 'status')
 * @returns {Promise<Object>} Review results summary
 */
async function executePRReviews(pullRequests, repository, triggerContext = 'unknown') {
  
  // Process PRs in parallel for better performance
  const prPromises = pullRequests.map(async pr => {
    const prResult = {
      prNumber: pr.number,
      success: false,
      error: null,
      skippedReason: null
    };

    try {
      // Extract SHA from PR data
      const commitSha = pr.head?.sha;

      if (!commitSha) {
        logger.error(
          {
            repo: repository.full_name,
            pr: pr.number,
            triggerContext: triggerContext,
            prData: JSON.stringify(pr)
          },
          'No commit SHA available for PR - cannot verify status'
        );
        prResult.skippedReason = 'No commit SHA available';
        prResult.error = 'Missing PR head SHA';
        return prResult;
      }

      // Check if we've already reviewed this PR at this commit
      const alreadyReviewed = await githubService.hasReviewedPRAtCommit({
        repoOwner: repository.owner.login,
        repoName: repository.name,
        prNumber: pr.number,
        commitSha: commitSha
      });

      if (alreadyReviewed) {
        logger.info(
          {
            repo: repository.full_name,
            pr: pr.number,
            commitSha: commitSha,
            triggerContext: triggerContext
          },
          'PR already reviewed at this commit - skipping duplicate review'
        );
        prResult.skippedReason = 'Already reviewed at this commit';
        return prResult;
      }

      // Add "review-in-progress" label
      try {
        await githubService.managePRLabels({
          repoOwner: repository.owner.login,
          repoName: repository.name,
          prNumber: pr.number,
          labelsToAdd: ['claude-review-in-progress'],
          labelsToRemove: ['claude-review-needed', 'claude-review-complete']
        });
      } catch (labelError) {
        logger.error(
          {
            err: labelError.message,
            repo: repository.full_name,
            pr: pr.number,
            triggerContext: triggerContext
          },
          'Failed to add review-in-progress label'
        );
        // Continue with review even if label fails
      }

      logger.info(
        {
          repo: repository.full_name,
          pr: pr.number,
          commitSha: commitSha,
          triggerContext: triggerContext
        },
        'All checks passed - triggering automated PR review'
      );

      // Create the PR review prompt (using the existing template)
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

Please perform a comprehensive review of PR #${pr.number} in repository ${repository.full_name}.`;

      // Process the PR review with Claude
      logger.info('Sending PR for automated Claude review');
      const claudeResponse = await claudeService.processCommand({
        repoFullName: repository.full_name,
        issueNumber: pr.number,
        command: prReviewPrompt,
        isPullRequest: true,
        branchName: pr.head.ref
      });

      logger.info(
        {
          repo: repository.full_name,
          pr: pr.number,
          responseLength: claudeResponse ? claudeResponse.length : 0,
          triggerContext: triggerContext
        },
        'Automated PR review completed successfully'
      );

      // Update label to show review is complete
      try {
        await githubService.managePRLabels({
          repoOwner: repository.owner.login,
          repoName: repository.name,
          prNumber: pr.number,
          labelsToAdd: ['claude-review-complete'],
          labelsToRemove: ['claude-review-in-progress', 'claude-review-needed']
        });
      } catch (labelError) {
        logger.error(
          {
            err: labelError.message,
            repo: repository.full_name,
            pr: pr.number,
            triggerContext: triggerContext
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
          errorMessage: reviewError.message || 'Unknown error',
          errorType: reviewError.constructor.name,
          repo: repository.full_name,
          pr: pr.number,
          triggerContext: triggerContext
        },
        'Error processing automated PR review'
      );

      // Remove in-progress label on error
      try {
        await githubService.managePRLabels({
          repoOwner: repository.owner.login,
          repoName: repository.name,
          prNumber: pr.number,
          labelsToRemove: ['claude-review-in-progress']
        });
      } catch (labelError) {
        logger.error(
          {
            err: labelError.message,
            repo: repository.full_name,
            pr: pr.number,
            triggerContext: triggerContext
          },
          'Failed to remove review-in-progress label after error'
        );
      }

      prResult.error = reviewError.message || 'Unknown error during review';
      return prResult;
    }
  });

  // Wait for all PR reviews to complete
  const promiseResults = await Promise.allSettled(prPromises);
  const prResults = promiseResults.map(result =>
    result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
  );

  // Count successes and failures (mutually exclusive)
  const successCount = prResults.filter(r => r.success).length;
  const failureCount = prResults.filter(
    r => !r.success && r.error && !r.skippedReason
  ).length;
  const skippedCount = prResults.filter(r => !r.success && r.skippedReason).length;

  return {
    results: prResults,
    successCount,
    failureCount,
    skippedCount
  };
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


    // Handle status events for debounced PR reviews
    if (event === 'status') {
      const status = payload.state;
      const targetUrl = payload.target_url;
      const context = payload.context;
      const sha = payload.sha;
      const repo = payload.repository;

      logger.info(
        {
          repo: repo.full_name,
          commitSha: sha,
          status: status,
          context: context,
          targetUrl: targetUrl
        },
        'Processing status webhook event'
      );

      // Only trigger on 'success' status for the combined status
      if (status === 'success') {
        try {
          // Find PRs associated with this commit
          const pullRequests = await githubService.findPRsForCommit({
            repoOwner: repo.owner.login,
            repoName: repo.name,
            commitSha: sha
          });

          if (pullRequests.length > 0) {
            logger.info(
              {
                repo: repo.full_name,
                commitSha: sha,
                prCount: pullRequests.length,
                prNumbers: pullRequests.map(pr => pr.number),
                context: context
              },
              'Status success - setting up debounced PR review'
            );

            // Use the commit SHA as the branch name for debouncing key
            // This ensures we debounce per commit rather than per branch
            const debounceKey = sha.substring(0, 12); // Use short SHA for readability

            // Set up debounced review for all found PRs
            setupDebouncedReview(repo.full_name, debounceKey, sha, async () => {
              try {
                logger.info(
                  {
                    repo: repo.full_name,
                    commitSha: sha,
                    prCount: pullRequests.length,
                    triggerContext: 'status_debounced'
                  },
                  'Executing debounced PR reviews'
                );

                // Execute PR reviews using the extracted function
                const reviewResults = await executePRReviews(pullRequests, repo, 'status_debounced');

                logger.info(
                  {
                    repo: repo.full_name,
                    commitSha: sha,
                    totalPRs: reviewResults.results.length,
                    successCount: reviewResults.successCount,
                    failureCount: reviewResults.failureCount,
                    skippedCount: reviewResults.skippedCount,
                    results: reviewResults.results
                  },
                  'Debounced PR review processing completed'
                );

              } catch (error) {
                logger.error(
                  {
                    err: error,
                    repo: repo.full_name,
                    commitSha: sha,
                    prCount: pullRequests.length
                  },
                  'Error in debounced PR review execution'
                );
              }
            });

            return res.status(200).json({
              success: true,
              message: `Status success received - debounced review scheduled for ${pullRequests.length} PRs`,
              context: {
                repo: repo.full_name,
                commitSha: sha,
                status: status,
                context: context,
                prCount: pullRequests.length,
                debounceDelayMs: PR_REVIEW_DEBOUNCE_DELAY,
                type: 'status'
              }
            });
          } else {
            logger.info(
              {
                repo: repo.full_name,
                commitSha: sha,
                status: status,
                context: context
              },
              'Status success but no PRs found for commit - no review needed'
            );

            return res.status(200).json({
              success: true,
              message: 'Status success received but no PRs found for commit',
              context: {
                repo: repo.full_name,
                commitSha: sha,
                status: status,
                context: context,
                type: 'status'
              }
            });
          }
        } catch (error) {
          logger.error(
            {
              err: error,
              repo: repo.full_name,
              commitSha: sha,
              status: status,
              context: context
            },
            'Error processing status event for PR review'
          );

          return res.status(500).json({
            success: false,
            error: 'Failed to process status event',
            message: error.message,
            context: {
              repo: repo.full_name,
              commitSha: sha,
              status: status,
              context: context,
              type: 'status'
            }
          });
        }
      } else {
        // Status is not 'success', so no action needed
        logger.debug(
          {
            repo: repo.full_name,
            commitSha: sha,
            status: status,
            context: context
          },
          'Status is not success - no PR review triggered'
        );

        return res.status(200).json({
          success: true,
          message: `Status '${status}' received - no action needed`,
          context: {
            repo: repo.full_name,
            commitSha: sha,
            status: status,
            context: context,
            type: 'status'
          }
        });
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
