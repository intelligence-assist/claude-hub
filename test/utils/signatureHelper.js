const crypto = require('crypto');

/**
 * Utility for generating GitHub webhook signatures for testing
 */
class SignatureHelper {
  /**
   * Create a GitHub webhook signature
   * @param {string|object} payload - The payload data (string or object to be stringified)
   * @param {string} secret - The webhook secret
   * @returns {string} - The signature in sha256=<hash> format
   */
  static createGitHubSignature(payload, secret) {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payloadString).digest('hex')}`;
  }

  /**
   * Verify a GitHub webhook signature
   * @param {string|object} payload - The payload data
   * @param {string} signature - The signature to verify
   * @param {string} secret - The webhook secret
   * @returns {boolean} - True if signature is valid
   */
  static verifyGitHubSignature(payload, signature, secret) {
    const expectedSignature = this.createGitHubSignature(payload, secret);
    // Check lengths first to avoid timingSafeEqual error with different-length buffers
    return (
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    );
  }

  /**
   * Create mock GitHub webhook headers with signature
   * @param {string|object} payload - The payload data
   * @param {string} secret - The webhook secret
   * @param {string} eventType - The GitHub event type (default: 'issue_comment')
   * @returns {object} - Headers object with signature and other webhook headers
   */
  static createWebhookHeaders(payload, secret, eventType = 'issue_comment') {
    return {
      'Content-Type': 'application/json',
      'X-GitHub-Event': eventType,
      'X-GitHub-Delivery': `test-delivery-${Date.now()}`,
      'X-Hub-Signature-256': this.createGitHubSignature(payload, secret),
      'User-Agent': 'GitHub-Hookshot/test'
    };
  }
}

module.exports = SignatureHelper;
