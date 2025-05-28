import { createLogger } from './logger';

const logger = createLogger('sanitize');

/**
 * Sanitizes text to prevent infinite loops by removing bot username mentions
 */
export function sanitizeBotMentions(text: string): string {
  if (!text) return text;

  // Get bot username from environment variables - required
  const BOT_USERNAME = process.env['BOT_USERNAME'];

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

/**
 * Sanitizes an array of labels to remove potentially sensitive or invalid characters
 */
export function sanitizeLabels(labels: string[]): string[] {
  return labels.map(label => label.replace(/[^a-zA-Z0-9:_-]/g, ''));
}

/**
 * Sanitizes input for safe usage in commands and prevents injection attacks
 */
export function sanitizeCommandInput(input: string): string {
  if (!input) return input;
  
  // Remove or escape potentially dangerous characters
  return input
    .replace(/[`$\\]/g, '') // Remove backticks, dollar signs, and backslashes
    .replace(/[;&|><]/g, '') // Remove command injection characters
    .trim();
}

/**
 * Validates that a string contains only safe repository name characters
 */
export function validateRepositoryName(name: string): boolean {
  const repoPattern = /^[a-zA-Z0-9._-]+$/;
  return repoPattern.test(name);
}

/**
 * Validates that a string contains only safe GitHub reference characters
 */
export function validateGitHubRef(ref: string): boolean {
  const refPattern = /^[a-zA-Z0-9._/-]+$/;
  return refPattern.test(ref);
}

/**
 * Sanitizes environment variable values for logging
 */
export function sanitizeEnvironmentValue(key: string, value: string): string {
  const sensitiveKeys = [
    'TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'CREDENTIAL',
    'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY', 'WEBHOOK_SECRET'
  ];
  
  const isSensitive = sensitiveKeys.some(sensitiveKey => 
    key.toUpperCase().includes(sensitiveKey)
  );
  
  return isSensitive ? '[REDACTED]' : value;
}