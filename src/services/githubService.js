const axios = require('axios');
const { createLogger } = require('../utils/logger');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('githubService');

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

    const githubToken = secureCredentials.get('GITHUB_TOKEN');

    // In test mode, just log the comment instead of posting to GitHub
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
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

    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/issues/${validated.issueNumber}/comments`;

    const response = await axios.post(
      url,
      { body },
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Claude-GitHub-Webhook'
        }
      }
    );

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        commentId: response.data.id
      },
      'Comment posted successfully'
    );

    return response.data;
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
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
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

    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/issues/${validated.issueNumber}/labels`;

    const response = await axios.post(
      url,
      { labels },
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Claude-GitHub-Webhook'
        }
      }
    );

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        issue: issueNumber,
        appliedLabels: response.data.map(label => label.name)
      },
      'Labels added successfully'
    );

    return response.data;
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
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
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
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/labels`;

        const response = await axios.post(url, label, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Claude-GitHub-Webhook'
          }
        });

        createdLabels.push(response.data);
        logger.debug({ labelName: label.name }, 'Label created successfully');
      } catch (error) {
        // Label might already exist - check if it's a 422 (Unprocessable Entity)
        if (error.response?.status === 422) {
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

    const githubToken = secureCredentials.get('GITHUB_TOKEN');

    // In test mode, return a mock successful status
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
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

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${ref}/status`;

    const response = await axios.get(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'Claude-GitHub-Webhook'
      }
    });

    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        ref: ref,
        state: response.data.state,
        totalCount: response.data.total_count
      },
      'Combined status retrieved successfully'
    );

    return response.data;
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
 * Creates an inline comment on a specific line in a pull request
 */
async function createInlineComment({ repoOwner, repoName, prNumber, commitId, path, line, body, startLine = null }) {
  try {
    // Validate parameters to prevent SSRF
    const validated = validateGitHubParams(repoOwner, repoName, prNumber);
    
    // Validate commit ID format
    if (!commitId || !/^[a-f0-9]{40}$/.test(commitId)) {
      throw new Error('Invalid commit ID format');
    }
    
    // Validate path
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid file path');
    }
    
    // Validate line numbers
    const lineNumber = parseInt(line, 10);
    if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
      throw new Error('Invalid line number');
    }
    
    let startLineNumber = null;
    if (startLine !== null) {
      startLineNumber = parseInt(startLine, 10);
      if (!Number.isInteger(startLineNumber) || startLineNumber <= 0 || startLineNumber >= lineNumber) {
        throw new Error('Invalid start line number');
      }
    }
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        path: path,
        line: lineNumber,
        startLine: startLineNumber,
        commitId: commitId.substring(0, 8) + '...',
        bodyLength: body.length
      },
      'Creating inline PR comment'
    );
    
    const githubToken = secureCredentials.get('GITHUB_TOKEN');
    
    // In test mode, just log the comment
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber,
          path: path,
          line: lineNumber,
          bodyPreview: body.substring(0, 100) + (body.length > 100 ? '...' : '')
        },
        'TEST MODE: Would create inline comment'
      );
      
      return {
        id: 'test-inline-comment-id',
        path: path,
        line: lineNumber,
        body: body,
        created_at: new Date().toISOString()
      };
    }
    
    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/pulls/${validated.issueNumber}/comments`;
    
    const requestBody = {
      body: body,
      commit_id: commitId,
      path: path,
      line: lineNumber,
      side: 'RIGHT'
    };
    
    // Add start_line for multi-line comments
    if (startLineNumber !== null) {
      requestBody.start_line = startLineNumber;
    }
    
    const response = await axios.post(url, requestBody, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Claude-GitHub-Webhook',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        commentId: response.data.id,
        path: path,
        line: lineNumber
      },
      'Inline comment created successfully'
    );
    
    return response.data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        path: path,
        line: line
      },
      'Error creating inline comment'
    );
    
    throw new Error(`Failed to create inline comment: ${error.message}`);
  }
}

/**
 * Submits a comprehensive PR review with multiple inline comments
 */
async function submitPullRequestReview({ repoOwner, repoName, prNumber, commitId, body, event, comments = [] }) {
  try {
    // Validate parameters
    const validated = validateGitHubParams(repoOwner, repoName, prNumber);
    
    // Validate commit ID format
    if (!commitId || !/^[a-f0-9]{40}$/.test(commitId)) {
      throw new Error('Invalid commit ID format');
    }
    
    // Validate event type
    const validEvents = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];
    if (!validEvents.includes(event)) {
      throw new Error(`Invalid event type. Must be one of: ${validEvents.join(', ')}`);
    }
    
    // Validate comments array
    if (comments && !Array.isArray(comments)) {
      throw new Error('Comments must be an array');
    }
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        event: event,
        commentsCount: comments.length,
        bodyLength: body.length,
        commitId: commitId.substring(0, 8) + '...'
      },
      'Submitting PR review'
    );
    
    const githubToken = secureCredentials.get('GITHUB_TOKEN');
    
    // In test mode, just log the review
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber,
          event: event,
          commentsCount: comments.length,
          bodyPreview: body.substring(0, 100) + (body.length > 100 ? '...' : '')
        },
        'TEST MODE: Would submit PR review'
      );
      
      return {
        id: 'test-review-id',
        state: event.toLowerCase(),
        body: body,
        submitted_at: new Date().toISOString()
      };
    }
    
    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/pulls/${validated.issueNumber}/reviews`;
    
    const requestBody = {
      commit_id: commitId,
      body: body,
      event: event
    };
    
    // Add comments if provided
    if (comments.length > 0) {
      requestBody.comments = comments.map(comment => ({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        ...(comment.startLine && { start_line: comment.startLine })
      }));
    }
    
    const response = await axios.post(url, requestBody, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Claude-GitHub-Webhook',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        reviewId: response.data.id,
        state: response.data.state,
        commentsCount: comments.length
      },
      'PR review submitted successfully'
    );
    
    return response.data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        event: event
      },
      'Error submitting PR review'
    );
    
    throw new Error(`Failed to submit PR review: ${error.message}`);
  }
}

/**
 * Gets detailed information about a pull request
 */
async function getPullRequestInfo({ repoOwner, repoName, prNumber }) {
  try {
    // Validate parameters
    const validated = validateGitHubParams(repoOwner, repoName, prNumber);
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Getting PR information'
    );
    
    const githubToken = secureCredentials.get('GITHUB_TOKEN');
    
    // In test mode, return mock data
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber
        },
        'TEST MODE: Returning mock PR info'
      );
      
      return {
        number: prNumber,
        title: 'Test PR',
        body: 'Test PR body',
        state: 'open',
        head: {
          sha: 'abcd1234567890abcd1234567890abcd12345678',
          ref: 'feature-branch'
        },
        base: {
          ref: 'main'
        },
        additions: 50,
        deletions: 25,
        changed_files: 5,
        files: [
          { filename: 'src/test1.js', additions: 20, deletions: 5, status: 'modified' },
          { filename: 'src/test2.js', additions: 30, deletions: 20, status: 'modified' }
        ]
      };
    }
    
    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/pulls/${validated.issueNumber}`;
    
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${githubToken}`,
        'User-Agent': 'Claude-GitHub-Webhook',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    // Also get the files information
    const filesUrl = `${url}/files`;
    const filesResponse = await axios.get(filesUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${githubToken}`,
        'User-Agent': 'Claude-GitHub-Webhook',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    // Combine PR info with files
    const prInfo = {
      ...response.data,
      files: filesResponse.data
    };
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        title: prInfo.title,
        state: prInfo.state,
        changedFiles: prInfo.changed_files,
        additions: prInfo.additions,
        deletions: prInfo.deletions
      },
      'PR information retrieved successfully'
    );
    
    return prInfo;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data
        },
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Error getting PR information'
    );
    
    throw new Error(`Failed to get PR information: ${error.message}`);
  }
}

/**
 * Gets the diff for a pull request
 */
async function getPullRequestDiff({ repoOwner, repoName, prNumber }) {
  try {
    // Validate parameters
    const validated = validateGitHubParams(repoOwner, repoName, prNumber);
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Getting PR diff'
    );
    
    const githubToken = secureCredentials.get('GITHUB_TOKEN');
    
    // In test mode, return mock diff
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
      logger.info(
        {
          repo: `${repoOwner}/${repoName}`,
          pr: prNumber
        },
        'TEST MODE: Returning mock diff'
      );
      
      return `diff --git a/src/test.js b/src/test.js
index 1234567..abcdefg 100644
--- a/src/test.js
+++ b/src/test.js
@@ -1,5 +1,8 @@
 const express = require('express');
+const validator = require('validator');
 
 function createApp() {
+  // Added input validation
+  if (!validator.isAlphanumeric(input)) {
+    throw new Error('Invalid input');
+  }
   return express();
 }`;
    }
    
    const url = `https://api.github.com/repos/${validated.repoOwner}/${validated.repoName}/pulls/${validated.issueNumber}`;
    
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/vnd.github.v3.diff',
        Authorization: `token ${githubToken}`,
        'User-Agent': 'Claude-GitHub-Webhook'
      }
    });
    
    logger.info(
      {
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber,
        diffLength: response.data.length
      },
      'PR diff retrieved successfully'
    );
    
    return response.data;
  } catch (error) {
    logger.error(
      {
        err: {
          message: error.message,
          status: error.response?.status
        },
        repo: `${repoOwner}/${repoName}`,
        pr: prNumber
      },
      'Error getting PR diff'
    );
    
    throw new Error(`Failed to get PR diff: ${error.message}`);
  }
}

module.exports = {
  postComment,
  addLabelsToIssue,
  createRepositoryLabels,
  getFallbackLabels,
  getCombinedStatus,
  createInlineComment,
  submitPullRequestReview,
  getPullRequestInfo,
  getPullRequestDiff
};
