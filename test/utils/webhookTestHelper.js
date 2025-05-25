const axios = require('axios');
const SignatureHelper = require('./signatureHelper');

/**
 * Utility for testing webhook functionality
 */
class WebhookTestHelper {
  constructor(webhookUrl = 'http://localhost:3001/api/webhooks/github', secret = 'test_secret') {
    this.webhookUrl = webhookUrl;
    this.secret = secret;
  }

  /**
   * Create a mock issue comment payload
   * @param {object} options - Configuration options
   * @returns {object} - Mock GitHub issue comment payload
   */
  createIssueCommentPayload(options = {}) {
    const defaults = {
      action: 'created',
      commentBody: '@TestBot Tell me about this repository',
      issueNumber: 123,
      repoOwner: 'testowner',
      repoName: 'test-repo',
      userLogin: 'testuser'
    };

    const config = { ...defaults, ...options };

    return {
      action: config.action,
      comment: {
        id: Date.now(),
        body: config.commentBody,
        user: {
          login: config.userLogin
        }
      },
      issue: {
        number: config.issueNumber
      },
      repository: {
        name: config.repoName,
        full_name: `${config.repoOwner}/${config.repoName}`,
        owner: {
          login: config.repoOwner
        }
      },
      sender: {
        login: config.userLogin
      }
    };
  }

  /**
   * Create a mock issue opened payload for auto-tagging
   * @param {object} options - Configuration options
   * @returns {object} - Mock GitHub issue opened payload
   */
  createIssueOpenedPayload(options = {}) {
    const defaults = {
      title: 'Application crashes when loading user data',
      body: 'The app consistently crashes when trying to load user profiles. This appears to be a critical bug affecting all users. Error occurs in the API endpoint.',
      issueNumber: 123,
      repoOwner: 'testowner',
      repoName: 'test-repo',
      userLogin: 'testuser'
    };

    const config = { ...defaults, ...options };

    return {
      action: 'opened',
      issue: {
        number: config.issueNumber,
        title: config.title,
        body: config.body,
        user: {
          login: config.userLogin
        }
      },
      repository: {
        name: config.repoName,
        full_name: `${config.repoOwner}/${config.repoName}`,
        owner: {
          login: config.repoOwner
        }
      }
    };
  }

  /**
   * Send a webhook request
   * @param {object} payload - The webhook payload
   * @param {string} eventType - The GitHub event type
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Axios response
   */
  async sendWebhook(payload, eventType = 'issue_comment', options = {}) {
    const headers = SignatureHelper.createWebhookHeaders(payload, this.secret, eventType);

    const config = {
      headers,
      timeout: options.timeout || 30000,
      ...options
    };

    return axios.post(this.webhookUrl, payload, config);
  }

  /**
   * Test issue comment webhook
   * @param {object} commentOptions - Options for comment payload
   * @returns {Promise<object>} - Test result
   */
  async testIssueComment(commentOptions = {}) {
    const payload = this.createIssueCommentPayload(commentOptions);

    try {
      const response = await this.sendWebhook(payload, 'issue_comment');
      return {
        success: true,
        status: response.status,
        data: response.data,
        payload
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        payload
      };
    }
  }

  /**
   * Test issue opened webhook for auto-tagging
   * @param {object} issueOptions - Options for issue payload
   * @returns {Promise<object>} - Test result
   */
  async testIssueOpened(issueOptions = {}) {
    const payload = this.createIssueOpenedPayload(issueOptions);

    try {
      const response = await this.sendWebhook(payload, 'issues');
      return {
        success: true,
        status: response.status,
        data: response.data,
        payload
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        payload
      };
    }
  }

  /**
   * Generate curl command for manual testing
   * @param {object} payload - The webhook payload
   * @param {string} eventType - The GitHub event type
   * @returns {string} - Curl command
   */
  generateCurlCommand(payload, eventType = 'issue_comment') {
    const headers = SignatureHelper.createWebhookHeaders(payload, this.secret, eventType);
    const payloadFile = 'webhook-payload.json';

    let cmd = '# Save payload to file:\n';
    cmd += `echo '${JSON.stringify(payload, null, 2)}' > ${payloadFile}\n\n`;
    cmd += '# Send webhook:\n';
    cmd += `curl -X POST \\\n  ${this.webhookUrl} \\\n`;

    Object.entries(headers).forEach(([key, value]) => {
      cmd += `  -H "${key}: ${value}" \\\n`;
    });

    cmd += `  -d @${payloadFile}`;

    return cmd;
  }
}

module.exports = WebhookTestHelper;
