const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('githubService');

// Default number of comments to retrieve
const DEFAULT_COMMENT_COUNT = 5;

/**
 * Creates GitHub API headers
 * @returns {Object} Headers for GitHub API
 */
function getGitHubHeaders() {
  return {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Claude-GitHub-Webhook'
  };
}

/**
 * Posts a comment to a GitHub issue or pull request
 */
async function postComment({ repoOwner, repoName, issueNumber, body }) {
  try {
    // Validate parameters to prevent SSRF
    const validated = validateGitHubParams(repoOwner, repoName, issueNumber);
    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber,
      bodyLength: body.length
    }, 'Posting comment to GitHub');

    // In test mode, just log the comment instead of posting to GitHub
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        bodyPreview: body.substring(0, 100) + (body.length > 100 ? '...' : '')
      }, 'TEST MODE: Would post comment to GitHub');

      return {
        id: 'test-comment-id',
        body: body,
        created_at: new Date().toISOString()
      };
    }

    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/issues/${validated.issueNumber}/comments`;

    const response = await axios.post(
      url,
      { body },
      {
        headers: getGitHubHeaders()
      }
    );

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber,
      commentId: response.data.id
    }, 'Comment posted successfully');

    return response.data;
  } catch (error) {
    logger.error({
      err: {
        message: error.message,
        responseData: error.response?.data
      },
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber
    }, 'Error posting comment to GitHub');

    throw new Error(`Failed to post comment: ${error.message}`);
  }
}

/**
 * Fetches issue or pull request details from GitHub
 * @param {Object} options - Options object
 * @param {string} options.repoOwner - Repository owner
 * @param {string} options.repoName - Repository name
 * @param {number} options.issueNumber - Issue or PR number
 * @param {boolean} [options.isPullRequest=false] - Whether this is a pull request
 * @returns {Promise<Object>} - Issue or PR details
 */
async function getIssueOrPrDetails({ repoOwner, repoName, issueNumber, isPullRequest = false }) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid issue number: ${issueNumber}. It must be a positive integer.`);
  }
  try {
    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issueNumber,
      isPullRequest
    }, `Fetching ${isPullRequest ? 'PR' : 'issue'} details`);

    // In test mode, return mock data
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: `${repoOwner}/${repoName}`,
        issueNumber
      }, 'TEST MODE: Would fetch issue/PR details from GitHub');

      return {
        title: 'Test Issue Title',
        body: 'Test issue description with some context',
        user: { login: 'test-user' },
        created_at: new Date().toISOString()
      };
    }

    // For PRs, we want to use the PR API endpoint if possible to get additional data
    // But the regular issues endpoint also returns basic PR info
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`;

    const response = await axios.get(url, {
      headers: getGitHubHeaders()
    });

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issueNumber,
      title: response.data.title
    }, `${isPullRequest ? 'PR' : 'Issue'} details fetched successfully`);

    return response.data;
  } catch (error) {
    logger.error({
      err: {
        message: error.message,
        responseData: error.response?.data
      },
      repo: `${repoOwner}/${repoName}`,
      issueNumber
    }, `Error fetching ${isPullRequest ? 'PR' : 'issue'} details`);

    throw new Error(`Failed to fetch ${isPullRequest ? 'PR' : 'issue'} details: ${error.message}`);
  }
}

/**
 * Fetches recent comments on an issue or pull request
 * @param {Object} options - Options object
 * @param {string} options.repoOwner - Repository owner
 * @param {string} options.repoName - Repository name
 * @param {number} options.issueNumber - Issue or PR number
 * @param {number} [options.count=5] - Number of recent comments to fetch
 * @returns {Promise<Array>} - Array of recent comments
 */
async function getRecentComments({ repoOwner, repoName, issueNumber, count = DEFAULT_COMMENT_COUNT }) {
  // Validate inputs to prevent SSRF
  const isValidRepoName = /^[a-zA-Z0-9-_]+$/;
  if (!isValidRepoName.test(repoOwner) || !isValidRepoName.test(repoName)) {
    throw new Error('Invalid repository owner or name');
  }
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Invalid issue number');
  }

  try {
    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issueNumber,
      count
    }, 'Fetching recent comments');

    // In test mode, return mock data
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: `${repoOwner}/${repoName}`,
        issueNumber
      }, 'TEST MODE: Would fetch recent comments from GitHub');

      // Generate mock comments
      return Array(count).fill(0).map((_, i) => ({
        id: `test-comment-${i}`,
        user: { login: `test-user-${i % 2}` },
        body: `Test comment ${i + 1}`,
        created_at: new Date(Date.now() - (i * 60000)).toISOString() // Offset by minutes
      }));
    }

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`;

    // Parameters to get recent comments in reverse chronological order
    const params = {
      sort: 'created',
      direction: 'desc',
      per_page: count
    };

    const response = await axios.get(url, {
      headers: getGitHubHeaders(),
      params
    });

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issueNumber,
      commentCount: response.data.length
    }, 'Recent comments fetched successfully');

    return response.data;
  } catch (error) {
    logger.error({
      err: {
        message: error.message,
        responseData: error.response?.data
      },
      repo: `${repoOwner}/${repoName}`,
      issueNumber
    }, 'Error fetching recent comments');

    throw new Error(`Failed to fetch recent comments: ${error.message}`);
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
    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber,
      labelCount: labels.length
    }, 'Adding labels to GitHub issue');

    // In test mode, just log the labels instead of applying to GitHub
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        labelCount: labels.length
      }, 'TEST MODE: Would add labels to GitHub issue');

      return {
        added_labels: labels,
        timestamp: new Date().toISOString()
      };
    }

    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/issues/${validated.issueNumber}/labels`;

    const response = await axios.post(
      url,
      { labels },
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Claude-GitHub-Webhook'
        }
      }
    );

    logger.info({
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber,
      appliedLabels: response.data.map(label => label.name)
    }, 'Labels added successfully');

    return response.data;
  } catch (error) {
    logger.error({
      err: {
        message: error.message,
        responseData: error.response?.data
      },
      repo: `${repoOwner}/${repoName}`,
      issue: issueNumber,
      labelCount: labels.length
    }, 'Error adding labels to GitHub issue');

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
    logger.info({
      repo: `${repoOwner}/${repoName}`,
      labelCount: labels.length
    }, 'Creating repository labels');

    // In test mode, just log the operation
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: `${repoOwner}/${repoName}`,
        labels: labels
      }, 'TEST MODE: Would create repository labels');
      return labels;
    }

    const createdLabels = [];
    
    for (const label of labels) {
      try {
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/labels`;
        
        const response = await axios.post(
          url,
          label,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Claude-GitHub-Webhook'
            }
          }
        );
        
        createdLabels.push(response.data);
        logger.debug({ labelName: label.name }, 'Label created successfully');
      } catch (error) {
        // Label might already exist - check if it's a 422 (Unprocessable Entity)
        if (error.response?.status === 422) {
          logger.debug({ labelName: label.name }, 'Label already exists, skipping');
        } else {
          logger.warn({
            err: error.message,
            labelName: label.name
          }, 'Failed to create label');
        }
      }
    }

    return createdLabels;
  } catch (error) {
    logger.error({
      err: error.message,
      repo: `${repoOwner}/${repoName}`
    }, 'Error creating repository labels');

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
  if (content.includes(' doc ') || content.includes('docs') || content.includes('readme') || content.includes('documentation')) {
    labels.push('type:documentation');
  } else if (content.includes('bug') || content.includes('error') || content.includes('issue') || content.includes('problem')) {
    labels.push('type:bug');
  } else if (content.includes('feature') || content.includes('add') || content.includes('new')) {
    labels.push('type:feature');
  } else if (content.includes('improve') || content.includes('enhance') || content.includes('better')) {
    labels.push('type:enhancement');
  } else if (content.includes('question') || content.includes('help') || content.includes('how')) {
    labels.push('type:question');
  }

  // Priority detection
  if (content.includes('critical') || content.includes('urgent') || content.includes('security') || content.includes('down')) {
    labels.push('priority:critical');
  } else if (content.includes('important') || content.includes('high')) {
    labels.push('priority:high');
  } else {
    labels.push('priority:medium');
  }

  // Component detection
  if (content.includes('api') || content.includes('endpoint')) {
    labels.push('component:api');
  } else if (content.includes('ui') || content.includes('frontend') || content.includes('interface')) {
    labels.push('component:frontend');
  } else if (content.includes('backend') || content.includes('server')) {
    labels.push('component:backend');
  } else if (content.includes('database') || content.includes('db')) {
    labels.push('component:database');
  } else if (content.includes('auth') || content.includes('login') || content.includes('permission')) {
    labels.push('component:auth');
  } else if (content.includes('webhook') || content.includes('github')) {
    labels.push('component:webhook');
  } else if (content.includes('docker') || content.includes('container')) {
    labels.push('component:docker');
  }

  return labels;
}

module.exports = {
  postComment,
  getIssueOrPrDetails,
  getRecentComments,
  DEFAULT_COMMENT_COUNT,
  addLabelsToIssue,
  createRepositoryLabels,
  getFallbackLabels
};
