const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('githubService');

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
  addLabelsToIssue,
  createRepositoryLabels,
  getFallbackLabels
};
