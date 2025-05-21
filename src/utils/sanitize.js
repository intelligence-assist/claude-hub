/**
 * Utilities for sanitizing text to prevent infinite loops and other issues
 */
const { createLogger } = require('./logger');
const logger = createLogger('sanitize');

/**
 * Sanitizes text to prevent infinite loops by removing bot username mentions
 * @param {string} text - The text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeBotMentions(text) {
  if (!text) return text;
  
  // Get bot username from environment variables - required
  const BOT_USERNAME = process.env.BOT_USERNAME;
  
  if (!BOT_USERNAME) {
    logger.warn('BOT_USERNAME environment variable is not set. Cannot sanitize properly.');
    return text;
  }

  // Create a regex to find all bot username mentions
  // First escape any special regex characters
  const escapedUsername = BOT_USERNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Look for the username with @ symbol anywhere in the text
  const botMentionRegex = new RegExp(escapedUsername, 'gi');
  
  // Replace mentions with a sanitized version (remove @ symbol if present)
  const sanitizedName = BOT_USERNAME.startsWith('@') ? BOT_USERNAME.substring(1) : BOT_USERNAME;
  const sanitized = text.replace(botMentionRegex, sanitizedName);
  
  // If sanitization occurred, log it
  if (sanitized !== text) {
    logger.warn('Sanitized bot mentions from text to prevent infinite loops');
  }
  
  return sanitized;
}

module.exports = {
  sanitizeBotMentions
};