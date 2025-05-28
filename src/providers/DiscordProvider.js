const { verify } = require('crypto');
const axios = require('axios');
const ChatbotProvider = require('./ChatbotProvider');
const { createLogger } = require('../utils/logger');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('DiscordProvider');

/**
 * Discord chatbot provider implementation
 * Handles Discord webhook interactions and message sending
 */
class DiscordProvider extends ChatbotProvider {
  constructor(config = {}) {
    super(config);
    this.botToken = null;
    this.publicKey = null;
    this.applicationId = null;
  }

  /**
   * Initialize Discord provider with credentials
   */
  async initialize() {
    try {
      this.botToken = secureCredentials.get('DISCORD_BOT_TOKEN') || process.env.DISCORD_BOT_TOKEN;
      this.publicKey = secureCredentials.get('DISCORD_PUBLIC_KEY') || process.env.DISCORD_PUBLIC_KEY;
      this.applicationId = secureCredentials.get('DISCORD_APPLICATION_ID') || process.env.DISCORD_APPLICATION_ID;

      if (!this.botToken || !this.publicKey) {
        throw new Error('Discord bot token and public key are required');
      }

      logger.info('Discord provider initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Discord provider');
      throw error;
    }
  }

  /**
   * Verify Discord webhook signature using Ed25519
   */
  verifyWebhookSignature(req) {
    try {
      const signature = req.headers['x-signature-ed25519'];
      const timestamp = req.headers['x-signature-timestamp'];

      if (!signature || !timestamp) {
        logger.warn('Missing Discord signature headers');
        return false;
      }

      // Skip verification in test mode
      if (process.env.NODE_ENV === 'test') {
        logger.warn('Skipping Discord signature verification (test mode)');
        return true;
      }

      const body = req.rawBody || JSON.stringify(req.body);
      const message = timestamp + body;

      try {
        const isValid = verify(
          'ed25519',
          Buffer.from(message),
          Buffer.from(this.publicKey, 'hex'),
          Buffer.from(signature, 'hex')
        );

        logger.debug({ isValid }, 'Discord signature verification completed');
        return isValid;
      } catch (cryptoError) {
        logger.warn(
          { err: cryptoError },
          'Discord signature verification failed due to crypto error'
        );
        return false;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error verifying Discord webhook signature');
      return false;
    }
  }

  /**
   * Parse Discord webhook payload
   */
  parseWebhookPayload(payload) {
    try {
      // Handle Discord interaction types
      switch (payload.type) {
        case 1: // PING
          return {
            type: 'ping',
            shouldRespond: true,
            responseData: { type: 1 } // PONG
          };

        case 2: // APPLICATION_COMMAND
          const repoInfo = this.extractRepoAndBranch(payload.data);
          return {
            type: 'command',
            command: payload.data?.name,
            options: payload.data?.options || [],
            channelId: payload.channel_id,
            guildId: payload.guild_id,
            userId: payload.member?.user?.id || payload.user?.id,
            username: payload.member?.user?.username || payload.user?.username,
            content: this.buildCommandContent(payload.data),
            interactionToken: payload.token,
            interactionId: payload.id,
            repo: repoInfo.repo,
            branch: repoInfo.branch
          };

        case 3: // MESSAGE_COMPONENT
          return {
            type: 'component',
            customId: payload.data?.custom_id,
            channelId: payload.channel_id,
            guildId: payload.guild_id,
            userId: payload.member?.user?.id || payload.user?.id,
            username: payload.member?.user?.username || payload.user?.username,
            interactionToken: payload.token,
            interactionId: payload.id
          };

        default:
          logger.warn({ type: payload.type }, 'Unknown Discord interaction type');
          return {
            type: 'unknown',
            shouldRespond: false
          };
      }
    } catch (error) {
      logger.error({ err: error }, 'Error parsing Discord webhook payload');
      throw error;
    }
  }

  /**
   * Build command content from Discord slash command data
   */
  buildCommandContent(commandData) {
    if (!commandData || !commandData.name) return '';

    let content = commandData.name;
    if (commandData.options && commandData.options.length > 0) {
      const args = commandData.options
        .map(option => `${option.name}:${option.value}`)
        .join(' ');
      content += ` ${args}`;
    }
    return content;
  }

  /**
   * Extract repository and branch information from Discord slash command options
   */
  extractRepoAndBranch(commandData) {
    if (!commandData || !commandData.options) {
      return { repo: null, branch: null };
    }

    const repoOption = commandData.options.find(opt => opt.name === 'repo');
    const branchOption = commandData.options.find(opt => opt.name === 'branch');

    // Only default to 'main' if we have a repo but no branch
    const repo = repoOption ? repoOption.value : null;
    const branch = branchOption ? branchOption.value : (repo ? 'main' : null);

    return { repo, branch };
  }

  /**
   * Extract bot command from Discord message
   */
  extractBotCommand(content) {
    if (!content) return null;

    // For Discord, commands are slash commands or direct mentions
    // Since this is already a command interaction, return the content
    return {
      command: content,
      originalMessage: content
    };
  }

  /**
   * Send response back to Discord
   */
  async sendResponse(context, response) {
    try {
      if (context.type === 'ping') {
        // For ping, response is handled by the webhook endpoint directly
        return;
      }

      // Send follow-up message for slash commands
      if (context.interactionToken && context.interactionId) {
        await this.sendFollowUpMessage(context.interactionToken, response);
      } else if (context.channelId) {
        await this.sendChannelMessage(context.channelId, response);
      }

      logger.info(
        {
          channelId: context.channelId,
          userId: context.userId,
          responseLength: response.length
        },
        'Discord response sent successfully'
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          context: {
            channelId: context.channelId,
            userId: context.userId
          }
        },
        'Failed to send Discord response'
      );
      throw error;
    }
  }

  /**
   * Send follow-up message for Discord interactions
   */
  async sendFollowUpMessage(interactionToken, content) {
    const url = `https://discord.com/api/v10/webhooks/${this.applicationId}/${interactionToken}`;
    
    // Split long messages to respect Discord's 2000 character limit
    const messages = this.splitLongMessage(content, 2000);
    
    for (const message of messages) {
      await axios.post(url, {
        content: message,
        flags: 0 // Make message visible to everyone
      }, {
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  /**
   * Send message to Discord channel
   */
  async sendChannelMessage(channelId, content) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    
    // Split long messages to respect Discord's 2000 character limit
    const messages = this.splitLongMessage(content, 2000);
    
    for (const message of messages) {
      await axios.post(url, {
        content: message
      }, {
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  /**
   * Split long messages into chunks that fit Discord's character limit
   */
  splitLongMessage(content, maxLength = 2000) {
    if (content.length <= maxLength) {
      return [content];
    }

    const messages = [];
    let currentMessage = '';
    const lines = content.split('\n');

    for (const line of lines) {
      if (currentMessage.length + line.length + 1 <= maxLength) {
        currentMessage += (currentMessage ? '\n' : '') + line;
      } else {
        if (currentMessage) {
          messages.push(currentMessage);
          currentMessage = line;
        } else {
          // Single line is too long, split it
          const chunks = this.splitLongLine(line, maxLength);
          messages.push(...chunks);
        }
      }
    }

    if (currentMessage) {
      messages.push(currentMessage);
    }

    return messages;
  }

  /**
   * Split a single long line into chunks
   */
  splitLongLine(line, maxLength) {
    const chunks = [];
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.substring(i, i + maxLength));
    }
    return chunks;
  }

  /**
   * Get Discord user ID for authorization
   */
  getUserId(context) {
    return context.userId;
  }

  /**
   * Format error message for Discord
   */
  formatErrorMessage(error, errorId) {
    const timestamp = new Date().toISOString();
    return `🚫 **Error Processing Command**\n\n` +
           `**Reference ID:** \`${errorId}\`\n` +
           `**Time:** ${timestamp}\n\n` +
           `Please contact an administrator with the reference ID above.`;
  }

  /**
   * Get Discord-specific bot mention pattern
   */
  getBotMention() {
    // Discord uses <@bot_id> format, but for slash commands we don't need mentions
    return this.config.botMention || 'claude';
  }
}

module.exports = DiscordProvider;