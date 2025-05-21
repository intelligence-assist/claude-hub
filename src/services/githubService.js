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

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`;

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

module.exports = {
  postComment,
  getIssueOrPrDetails,
  getRecentComments,
  DEFAULT_COMMENT_COUNT
};
