const { Octokit } = require('@octokit/rest');
const { createLogger } = require('../utils/logger');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('githubService');

// Create Octokit instance (lazy initialization)
let octokit = null;

function getOctokit() {
  if (!octokit) {
    const githubToken = secureCredentials.get('GITHUB_TOKEN');
    if (githubToken && githubToken.includes('ghp_')) {
      octokit = new Octokit({
        auth: githubToken,
        userAgent: 'Claude-GitHub-Webhook'
      });
    }
  }
  return octokit;
}

/**
 * Posts a comment to a GitHub issue or pull request
 */
async function postComment({ repoOwner, repoName, issueNumber, body }) {
  try {
    // Validate parameters to prevent SSRF
    const validated = validateGitHubParams(repoOwner, repoName, issueNumber);
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        bodyLength: body.length
      },
      'Posting comment to GitHub'
    );

    // In test mode, just log the comment instead of posting to GitHub
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          issue: issueNumber,
          bodyPreview: body.substring(0, 100) + (body.length > 100 ? '...' : '')
        },
        'TEST MODE: Would post comment to GitHub'
      );

      return {
        id: 'test-comment-id',
        body: body,
        created_at: new Date().toISOString()
      };
    }

    // Use Octokit to create comment
    const { data } = await client.issues.createComment({
      owner: validated.repoOwner,
      repo: validated.repoName,
      issue_number: validated.issueNumber,
      body: body
    });

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        commentId: data.id
      },
      'Comment posted successfully'
    );

    return data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber
      },
      'Error posting comment to GitHub'
    );

    throw new Error(`Failed to post comment: ${error.message}`);
  }
}

/**
 * Validates GitHub repository and issue parameters to prevent SSRF
 */
function validateGitHubParams(repoOwner, repoName, issueNumber) {
  // Validate repoOwner and repoName contain only safe characters
  const repoPattern = /^[a-zA-Z0-9._-]+$/;
  if (!repoPattern.test(repoOwner) || !repoPattern.test(repoName)) {
    throw new Error('Invalid repository owner or name - contains unsafe characters');
  }

  // Validate issueNumber is a positive integer
  const issueNum = parseInt(issueNumber, 10);
  if (!Number.isInteger(issueNum) || issueNum <= 0) {
    throw new Error('Invalid issue number - must be a positive integer');
  }

  return { repoOwner, repoName, issueNumber: issueNum };
}

/**
 * Adds labels to a GitHub issue
 */
async function addLabelsToIssue({ repoOwner, repoName, issueNumber, labels }) {
  try {
    // Validate parameters to prevent SSRF
    const validated = validateGitHubParams(repoOwner, repoName, issueNumber);
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        labelCount: labels.length
      },
      'Adding labels to GitHub issue'
    );

    // In test mode, just log the labels instead of applying to GitHub
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          issue: issueNumber,
          labelCount: labels.length
        },
        'TEST MODE: Would add labels to GitHub issue'
      );

      return {
        added_labels: labels,
        timestamp: new Date().toISOString()
      };
    }

    // Use Octokit to add labels
    const { data } = await client.issues.addLabels({
      owner: validated.repoOwner,
      repo: validated.repoName,
      issue_number: validated.issueNumber,
      labels: labels
    });

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        appliedLabels: data.map(label => label.name)
      },
      'Labels added successfully'
    );

    return data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        labelCount: labels.length
      },
      'Error adding labels to GitHub issue'
    );

    throw new Error(`Failed to add labels: ${error.message}`);
  }
}

/**
 * Creates repository labels if they don't exist
 */
async function createRepositoryLabels({ repoOwner, repoName, labels }) {
  try {
    // Validate repository parameters to prevent SSRF
    const repoPattern = /^[a-zA-Z0-9._-]+$/;
    if (!repoPattern.test(repoOwner) || !repoPattern.test(repoName)) {
      throw new Error('Invalid repository owner or name - contains unsafe characters');
    }
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        labelCount: labels.length
      },
      'Creating repository labels'
    );

    // In test mode, just log the operation
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          labels: labels
        },
        'TEST MODE: Would create repository labels'
      );
      return labels;
    }

    const createdLabels = [];

    for (const label of labels) {
      try {
        // Use Octokit to create label
        const { data } = await client.issues.createLabel({
          owner: repoOwner,
          repo: repoName,
          name: label.name,
          color: label.color,
          description: label.description
        });

        createdLabels.push(data);
        logger.debug({ labelName: label.name }, 'Label created successfully');
      } catch (error) {
        // Label might already exist - check if it's a 422 (Unprocessable Entity)
        if (error.status === 422) {
          logger.debug({ labelName: label.name }, 'Label already exists, skipping');
        } else {
          logger.warn(
            {
              err: error.message,
              labelName: label.name
            },
            'Failed to create label'
          );
        }
      }
    }

    return createdLabels;
  } catch (error) {
    logger.error(
      {
        err: error.message,
        repo: `${repoOwner}/${repoName}`
      },
      'Error creating repository labels'
    );

    throw new Error(`Failed to create labels: ${error.message}`);
  }
}

/**
 * Provides fallback labels based on simple keyword matching
 */
async function getFallbackLabels(title, body) {
  const content = `${title} ${body || ''}`.toLowerCase();
  const labels = [];

  // Type detection - check documentation first for specificity
  if (
    content.includes(' doc ') ||
    content.includes('docs') ||
    content.includes('readme') ||
    content.includes('documentation')
  ) {
    labels.push('type:documentation');
  } else if (
    content.includes('bug') ||
    content.includes('error') ||
    content.includes('issue') ||
    content.includes('problem')
  ) {
    labels.push('type:bug');
  } else if (content.includes('feature') || content.includes('add') || content.includes('new')) {
    labels.push('type:feature');
  } else if (
    content.includes('improve') ||
    content.includes('enhance') ||
    content.includes('better')
  ) {
    labels.push('type:enhancement');
  } else if (content.includes('question') || content.includes('help') || content.includes('how')) {
    labels.push('type:question');
  }

  // Priority detection
  if (
    content.includes('critical') ||
    content.includes('urgent') ||
    content.includes('security') ||
    content.includes('down')
  ) {
    labels.push('priority:critical');
  } else if (content.includes('important') || content.includes('high')) {
    labels.push('priority:high');
  } else {
    labels.push('priority:medium');
  }

  // Component detection
  if (content.includes('api') || content.includes('endpoint')) {
    labels.push('component:api');
  } else if (
    content.includes('ui') ||
    content.includes('frontend') ||
    content.includes('interface')
  ) {
    labels.push('component:frontend');
  } else if (content.includes('backend') || content.includes('server')) {
    labels.push('component:backend');
  } else if (content.includes('database') || content.includes('db')) {
    labels.push('component:database');
  } else if (
    content.includes('auth') ||
    content.includes('login') ||
    content.includes('permission')
  ) {
    labels.push('component:auth');
  } else if (content.includes('webhook') || content.includes('github')) {
    labels.push('component:webhook');
  } else if (content.includes('docker') || content.includes('container')) {
    labels.push('component:docker');
  }

  return labels;
}

/**
 * Gets the combined status for a specific commit/ref
 * Used to verify all required status checks have passed
 */
async function getCombinedStatus({ repoOwner, repoName, ref }) {
  try {
    // Validate parameters to prevent SSRF
    const repoPattern = /^[a-zA-Z0-9._-]+$/;
    if (!repoPattern.test(repoOwner) || !repoPattern.test(repoName)) {
      throw new Error('Invalid repository owner or name - contains unsafe characters');
    }

    // Validate ref (commit SHA, branch, or tag)
    const refPattern = /^[a-zA-Z0-9._/-]+$/;
    if (!refPattern.test(ref)) {
      throw new Error('Invalid ref - contains unsafe characters');
    }

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        ref: ref
      },
      'Getting combined status from GitHub'
    );

    // In test mode, return a mock successful status
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          ref: ref
        },
        'TEST MODE: Returning mock successful combined status'
      );

      return {
        state: 'success',
        total_count: 2,
        statuses: [
          { state: 'success', context: 'ci/test' },
          { state: 'success', context: 'ci/build' }
        ]
      };
    }

    // Use Octokit to get combined status
    const { data } = await client.repos.getCombinedStatusForRef({
      owner: repoOwner,
      repo: repoName,
      ref: ref
    });

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        ref: ref,
        state: data.state,
        totalCount: data.total_count
      },
      'Combined status retrieved successfully'
    );

    return data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        ref: ref
      },
      'Error getting combined status from GitHub'
    );

    throw new Error(`Failed to get combined status: ${error.message}`);
  }
}

/**
 * Check if we've already reviewed this PR at the given commit SHA
 * @param {Object} params
 * @param {string} params.repoOwner - Repository owner
 * @param {string} params.repoName - Repository name  
 * @param {number} params.prNumber - Pull request number
 * @param {string} params.commitSha - Commit SHA to check
 * @returns {Promise<boolean>} True if already reviewed at this SHA
 */
async function hasReviewedPRAtCommit({ repoOwner, repoName, prNumber, commitSha }) {
  try {
    // Validate parameters
    const repoPattern = /^[a-zA-Z0-9._-]+$/;
    if (!repoPattern.test(repoOwner) || !repoPattern.test(repoName)) {
      throw new Error('Invalid repository owner or name - contains unsafe characters');
    }

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        commitSha: commitSha
      },
      'Checking if PR has been reviewed at commit'
    );

    // In test mode, return false to allow review
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      return false;
    }

    // Get review comments for this PR using Octokit
    const { data: reviews } = await client.pulls.listReviews({
      owner: repoOwner,
      repo: repoName,
      pull_number: prNumber
    });

    // Check if any review mentions this specific commit SHA
    const botUsername = process.env.BOT_USERNAME || 'ClaudeBot';
    const existingReview = reviews.find(review => {
      return review.user.login === botUsername && 
             review.body && 
             review.body.includes(`commit: ${commitSha}`);
    });

    return !!existingReview;
  } catch (error) {
    logger.error(
      {
        err: error.message,
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Failed to check for existing reviews'
    );
    // On error, assume not reviewed to avoid blocking reviews
    return false;
  }
}

/**
 * Makes a direct GitHub API request using Octokit
 * @param {string} url - The GitHub API URL
 * @returns {Promise<Object>} The API response data
 */
async function makeGitHubRequest(url) {
  try {
    const client = getOctokit();
    if (!client) {
      throw new Error('GitHub client not initialized');
    }

    // Validate that the URL is a GitHub API URL to prevent SSRF
    if (!url.startsWith('https://api.github.com/')) {
      throw new Error('Invalid GitHub API URL');
    }

    // Extract the path from the full URL
    const apiPath = url.replace('https://api.github.com', '');
    
    logger.info({
      url,
      apiPath
    }, 'Making GitHub API request');

    // Use Octokit's request method for arbitrary endpoints
    const { data } = await client.request(`GET ${apiPath}`);
    
    return data;
  } catch (error) {
    logger.error({
      err: error.message,
      url,
      status: error.status
    }, 'GitHub API request failed');
    
    throw error;
  }
}

/**
 * Add or remove labels on a pull request
 * @param {Object} params
 * @param {string} params.repoOwner - Repository owner
 * @param {string} params.repoName - Repository name
 * @param {number} params.prNumber - Pull request number
 * @param {string[]} params.labelsToAdd - Labels to add
 * @param {string[]} params.labelsToRemove - Labels to remove
 */
async function managePRLabels({ repoOwner, repoName, prNumber, labelsToAdd = [], labelsToRemove = [] }) {
  try {
    // Validate parameters
    const repoPattern = /^[a-zA-Z0-9._-]+$/;
    if (!repoPattern.test(repoOwner) || !repoPattern.test(repoName)) {
      throw new Error('Invalid repository owner or name - contains unsafe characters');
    }

    // In test mode, just log
    const client = getOctokit();
    if (process.env.NODE_ENV === 'test' || !client) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber,
          labelsToAdd,
          labelsToRemove
        },
        'TEST MODE: Would manage PR labels'
      );
      return;
    }

    // Remove labels first using Octokit
    for (const label of labelsToRemove) {
      try {
        await client.issues.removeLabel({
          owner: repoOwner,
          repo: repoName,
          issue_number: prNumber,
          name: label
        });
        logger.info(
          {
            repo: `${repoOwner}/${repoName}`,
            pr: prNumber,
            label
          },
          'Removed label from PR'
        );
      } catch (error) {
        // Ignore 404 errors (label not present)
        if (error.status !== 404) {
          logger.error(
            {
              err: error.message,
              label
            },
            'Failed to remove label'
          );
        }
      }
    }

    // Add new labels using Octokit
    if (labelsToAdd.length > 0) {
      await client.issues.addLabels({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        labels: labelsToAdd
      });
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber,
          labels: labelsToAdd
        },
        'Added labels to PR'
      );
    }
  } catch (error) {
    logger.error(
      {
        err: error.message,
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Failed to manage PR labels'
    );
    throw error;
  }
}

module.exports = {
  postComment,
  addLabelsToIssue,
  createRepositoryLabels,
  getFallbackLabels,
  getCombinedStatus,
  hasReviewedPRAtCommit,
  managePRLabels,
  makeGitHubRequest
};
