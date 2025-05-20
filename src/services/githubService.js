const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('githubService');

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


module.exports = {
  postComment
};
