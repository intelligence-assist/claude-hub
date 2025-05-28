/**
 * Base interface for all chatbot providers
 * Defines the contract that all chatbot providers must implement
 */
class ChatbotProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  /**
   * Initialize the provider with necessary credentials and setup
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Verify incoming webhook signature for security
   * @param {Object} req - Express request object
   * @returns {boolean} - True if signature is valid
   */
  verifyWebhookSignature(req) {
    throw new Error('verifyWebhookSignature() must be implemented by subclass');
  }

  /**
   * Parse incoming webhook payload to extract message and context
   * @param {Object} payload - Raw webhook payload
   * @returns {Object} - Standardized message object
   */
  parseWebhookPayload(payload) {
    throw new Error('parseWebhookPayload() must be implemented by subclass');
  }

  /**
   * Check if message mentions the bot and extract command
   * @param {string} message - Message content
   * @returns {Object|null} - Command object or null if no mention
   */
  extractBotCommand(message) {
    throw new Error('extractBotCommand() must be implemented by subclass');
  }

  /**
   * Send response back to the chat platform
   * @param {Object} context - Message context (channel, user, etc.)
   * @param {string} response - Response text
   * @returns {Promise<void>}
   */
  async sendResponse(context, response) {
    throw new Error('sendResponse() must be implemented by subclass');
  }

  /**
   * Get platform-specific user ID for authorization
   * @param {Object} context - Message context
   * @returns {string} - User identifier
   */
  getUserId(context) {
    throw new Error('getUserId() must be implemented by subclass');
  }

  /**
   * Format error message for the platform
   * @param {Error} error - Error object
   * @param {string} errorId - Error reference ID
   * @returns {string} - Formatted error message
   */
  formatErrorMessage(error, errorId) {
    const timestamp = new Date().toISOString();
    return `❌ An error occurred while processing your command. (Reference: ${errorId}, Time: ${timestamp})\n\nPlease check with an administrator to review the logs for more details.`;
  }

  /**
   * Check if user is authorized to use the bot
   * @param {string} userId - Platform-specific user ID
   * @returns {boolean} - True if authorized
   */
  isUserAuthorized(userId) {
    if (!userId) return false;

    const authorizedUsers = this.config.authorizedUsers || 
      process.env.AUTHORIZED_USERS?.split(',').map(u => u.trim()) ||
      [process.env.DEFAULT_AUTHORIZED_USER || 'admin'];

    return authorizedUsers.includes(userId);
  }

  /**
   * Get provider name for logging and identification
   * @returns {string} - Provider name
   */
  getProviderName() {
    return this.name;
  }

  /**
   * Get bot mention pattern for this provider
   * @returns {string} - Bot username/mention pattern
   */
  getBotMention() {
    return this.config.botMention || process.env.BOT_USERNAME || '@ClaudeBot';
  }
}

module.exports = ChatbotProvider;