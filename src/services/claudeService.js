const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
// Use sync methods for file operations that need to be synchronous
const fsSync = require('fs');
const path = require('path');
// const os = require('os');
const { createLogger } = require('../utils/logger');
// const awsCredentialProvider = require('../utils/awsCredentialProvider');
const { sanitizeBotMentions } = require('../utils/sanitize');

const logger = createLogger('claudeService');

// Get bot username from environment variables - required
const BOT_USERNAME = process.env.BOT_USERNAME;

// Validate bot username is set
if (!BOT_USERNAME) {
  logger.error('BOT_USERNAME environment variable is not set in claudeService. This is required to prevent infinite loops.');
  throw new Error('BOT_USERNAME environment variable is required');
}

// Using the shared sanitization utility from utils/sanitize.js

/**
 * Processes a command using Claude Code CLI
 *
 * @param {Object} options - The options for processing the command
 * @param {string} options.repoFullName - The full name of the repository (owner/repo)
 * @param {number|null} options.issueNumber - The issue number (can be null for direct API calls)
 * @param {string} options.command - The command to process with Claude
 * @param {boolean} [options.isPullRequest=false] - Whether this is a pull request
 * @param {string} [options.branchName] - The branch name for pull requests
 * @returns {Promise<string>} - Claude's response
 */
async function processCommand({ repoFullName, issueNumber, command, isPullRequest = false, branchName = null }) {
  try {
    logger.info({
      repo: repoFullName,
      issue: issueNumber,
      isPullRequest,
      branchName,
      commandLength: command.length
    }, 'Processing command with Claude');

    // In test mode, skip execution and return a mock response
    if (process.env.NODE_ENV === 'test' || !process.env.GITHUB_TOKEN.includes('ghp_')) {
      logger.info({
        repo: repoFullName,
        issue: issueNumber
      }, 'TEST MODE: Skipping Claude execution');

      // Create a test response and sanitize it
      const testResponse = `Hello! I'm Claude responding to your request.

Since this is a test environment, I'm providing a simulated response. In production, I would:
1. Clone the repository ${repoFullName}
2. ${isPullRequest ? `Checkout PR branch: ${branchName}` : 'Use the main branch'}
3. Analyze the codebase and execute: "${command}"
4. Use GitHub CLI to interact with issues, PRs, and comments

For real functionality, please configure valid GitHub and Claude API tokens.`;
      
      // Always sanitize responses, even in test mode
      return sanitizeBotMentions(testResponse);
    }

    // Build Docker image if it doesn't exist
    const dockerImageName = 'claude-code-runner:latest';
    try {
      execSync(`docker inspect ${dockerImageName}`, { stdio: 'ignore' });
      logger.info('Docker image already exists');
    } catch (e) {
      logger.info('Building Docker image for Claude Code runner');
      execSync(`docker build -f Dockerfile.claudecode -t ${dockerImageName} .`, {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });
    }

    // Create unique container name
    const containerName = `claude-${repoFullName.replace(/\//g, '-')}-${Date.now()}`;
    
    // Create the full prompt with context and instructions
    const fullPrompt = `You are Claude, an AI assistant responding to a GitHub ${isPullRequest ? 'pull request' : 'issue'} via the ${BOT_USERNAME} webhook.

**Context:**
- Repository: ${repoFullName}
- ${isPullRequest ? 'Pull Request' : 'Issue'} Number: #${issueNumber}
- Current Branch: ${branchName || 'main'}
- Running in: Unattended mode

**Important Instructions:**
1. You have full GitHub CLI access via the 'gh' command
2. When writing code:
   - Always create a feature branch for new work
   - Make commits with descriptive messages
   - Push your work to the remote repository
   - Run all tests and ensure they pass
   - Fix any linting or type errors
   - Create a pull request if appropriate
3. Iterate until the task is complete - don't stop at partial solutions
4. Always check in your work by pushing to the remote before finishing
5. Use 'gh issue comment' or 'gh pr comment' to provide updates on your progress
6. If you encounter errors, debug and fix them before completing
7. **IMPORTANT - Markdown Formatting:**
   - When your response contains markdown (like headers, lists, code blocks), return it as properly formatted markdown
   - Do NOT escape or encode special characters like newlines (\\n) or quotes
   - Return clean, human-readable markdown that GitHub will render correctly
   - Your response should look like normal markdown text, not escaped strings
8. **Request Acknowledgment:**
   - For larger or complex tasks that will take significant time, first acknowledge the request
   - Post a brief comment like "I understand. Working on [task description]..." before starting
   - Use 'gh issue comment' or 'gh pr comment' to post this acknowledgment immediately
   - This lets the user know their request was received and is being processed

**User Request:**
${command}

Please complete this task fully and autonomously.`;

    // Prepare environment variables for the container
    const envVars = {
      REPO_FULL_NAME: repoFullName,
      ISSUE_NUMBER: issueNumber || '',
      IS_PULL_REQUEST: isPullRequest ? 'true' : 'false',
      BRANCH_NAME: branchName || '',
      COMMAND: fullPrompt,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
    };

    // Build docker run command - properly escape values for shell
    const envArgs = Object.entries(envVars)
      .filter(([_, value]) => value !== undefined && value !== '')
      .map(([key, value]) => {
        // Convert to string and escape shell special characters in the value
        const stringValue = String(value);
        // Write complex values to files for safer handling
        if (key === 'COMMAND' && stringValue.length > 500) {
          const crypto = require('crypto');
          const randomSuffix = crypto.randomBytes(16).toString('hex');
          const tmpFile = `/tmp/claude-command-${Date.now()}-${randomSuffix}.txt`;
          fsSync.writeFileSync(tmpFile, stringValue, { mode: 0o600 }); // Secure file permissions
          return `-e ${key}="$(cat ${tmpFile})"`;
        }
        // Escape for shell with double quotes (more reliable than single quotes)
        const escapedValue = stringValue.replace(/["\\$`!]/g, '\\$&');
        return `-e ${key}="${escapedValue}"`;
      })
      .join(' ');

    // Run the container
    logger.info({
      containerName,
      repo: repoFullName,
      isPullRequest,
      branch: branchName
    }, 'Starting Claude Code container');

    const dockerCommand = `docker run --rm --privileged --cap-add=NET_ADMIN --cap-add=NET_RAW --cap-add=SYS_TIME --cap-add=DAC_OVERRIDE --cap-add=AUDIT_WRITE --cap-add=SYS_ADMIN --name ${containerName} ${envArgs} ${dockerImageName}`;
    
    // Create sanitized version for logging (remove sensitive values)
    const sanitizedCommand = dockerCommand.replace(/-e [A-Z_]+=".+?"/g, (match) => {
      // Extract the environment variable name, handling both quotes and command substitution
      const keyMatch = match.match(/-e ([A-Z_]+)=/);
      if (!keyMatch) return match;
      
      const envKey = keyMatch[1];
      const sensitiveSKeys = ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];
      if (sensitiveSKeys.includes(envKey)) {
        return `-e ${envKey}="[REDACTED]"`;
      }
      // For the command, also redact to avoid logging the full command
      if (envKey === 'COMMAND') {
        return `-e ${envKey}="[COMMAND_CONTENT]"`;
      }
      return match;
    });
    
    try {
      logger.info({ dockerCommand: sanitizedCommand }, 'Executing Docker command');
      
      // Clear any temporary command files after execution
      const cleanupTempFiles = () => {
        try {
          const tempFiles = execSync('find /tmp -name "claude-command-*.txt" -type f').toString().split('\n');
          tempFiles.filter(f => f).forEach(file => {
            try {
              fsSync.unlinkSync(file);
              logger.info(`Removed temp file: ${file}`);
            } catch (e) {
              logger.warn(`Failed to remove temp file: ${file}`);
            }
          });
        } catch (e) {
          logger.warn('Failed to clean up temp files');
        }
      };
      
      // Get container lifetime from environment variable or use default (2 hours)
      const containerLifetimeMs = parseInt(process.env.CONTAINER_LIFETIME_MS, 10) || 7200000; // 2 hours in milliseconds
      logger.info({ containerLifetimeMs }, 'Setting container lifetime');
      
      const result = await execAsync(dockerCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: containerLifetimeMs // Container lifetime in milliseconds
      });

      // Clean up temporary files used for command passing
      cleanupTempFiles();

      let responseText = result.stdout.trim();
      
      // Check for empty response
      if (!responseText) {
        logger.warn({
          containerName,
          repo: repoFullName,
          issue: issueNumber
        }, 'Empty response from Claude Code container');
        
        // Try to get container logs as the response instead
        try {
          responseText = execSync(`docker logs ${containerName} 2>&1`, { 
            encoding: 'utf8',
            maxBuffer: 1024 * 1024
          });
          logger.info('Retrieved response from container logs');
        } catch (e) {
          logger.error({
            error: e.message,
            containerName
          }, 'Failed to get container logs as fallback');
        }
      }
      
      // Sanitize response to prevent infinite loops by removing bot mentions
      responseText = sanitizeBotMentions(responseText);
      
      logger.info({
        repo: repoFullName,
        issue: issueNumber,
        responseLength: responseText.length,
        containerName,
        stdout: responseText.substring(0, 500) // Log first 500 chars
      }, 'Claude Code execution completed successfully');

      return responseText;

    } catch (error) {
      // Clean up temporary files even when there's an error
      try {
        const tempFiles = execSync('find /tmp -name "claude-command-*.txt" -type f').toString().split('\n');
        tempFiles.filter(f => f).forEach(file => {
          try {
            fsSync.unlinkSync(file);
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Sanitize stderr and stdout to remove any potential credentials
      const sanitizeOutput = (output) => {
        if (!output) return output;
        // Import the sanitization utility
        let sanitized = output.toString();
        
        // Sensitive values to redact
        const sensitiveValues = [
          process.env.GITHUB_TOKEN,
          process.env.ANTHROPIC_API_KEY,
          envVars.AWS_ACCESS_KEY_ID,
          envVars.AWS_SECRET_ACCESS_KEY,
          envVars.AWS_SESSION_TOKEN
        ].filter(val => val && val.length > 0);
        
        sensitiveValues.forEach(value => {
          if (value) {
            // Convert to string and escape regex special characters
            const stringValue = String(value);
            // Escape regex special characters
            const escapedValue = stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            sanitized = sanitized.replace(new RegExp(escapedValue, 'g'), '[REDACTED]');
          }
        });
        return sanitized;
      };
      
      // Check for specific error types
      const errorMsg = error.message || '';
      const errorOutput = error.stderr ? error.stderr.toString() : '';
      
      // Check if this is a docker image not found error
      if (errorOutput.includes('Unable to find image') || errorMsg.includes('Unable to find image')) {
        logger.error('Docker image not found. Attempting to rebuild...');
        try {
          execSync(`docker build -f Dockerfile.claudecode -t ${dockerImageName} .`, {
            cwd: path.join(__dirname, '../..'),
            stdio: 'pipe'
          });
          logger.info('Successfully rebuilt Docker image');
        } catch (rebuildError) {
          logger.error({
            error: rebuildError.message
          }, 'Failed to rebuild Docker image');
        }
      }
      
      logger.error({
        error: error.message,
        stderr: sanitizeOutput(error.stderr),
        stdout: sanitizeOutput(error.stdout),
        containerName,
        dockerCommand: sanitizedCommand
      }, 'Error running Claude Code container');

      // Try to get container logs for debugging
      try {
        const logs = execSync(`docker logs ${containerName} 2>&1`, { 
          encoding: 'utf8',
          maxBuffer: 1024 * 1024
        });
        logger.error({ containerLogs: logs }, 'Container logs');
      } catch (e) {
        logger.error({ error: e.message }, 'Failed to get container logs');
      }

      // Try to clean up the container if it's still running
      try {
        execSync(`docker kill ${containerName}`, { stdio: 'ignore' });
      } catch (e) {
        // Container might already be stopped
      }

      // Generate an error ID for log correlation
      const timestamp = new Date().toISOString();
      const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;
      
      // Log the detailed error with full context
      const sanitizedStderr = sanitizeOutput(error.stderr);
      const sanitizedStdout = sanitizeOutput(error.stdout);
      
      logger.error({
        errorId,
        timestamp,
        error: error.message,
        stderr: sanitizedStderr,
        stdout: sanitizedStdout,
        containerName,
        repo: repoFullName,
        issue: issueNumber
      }, 'Claude Code container execution failed (with error reference)');
      
      // Throw a generic error with reference ID, but without sensitive details
      const errorMessage = sanitizeBotMentions(
        `Error executing Claude command (Reference: ${errorId}, Time: ${timestamp})`
      );
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    // Sanitize the error message to remove any credentials
    const sanitizeMessage = (message) => {
      if (!message) return message;
      let sanitized = message;
      const sensitivePatterns = [
        /AWS_ACCESS_KEY_ID="[^"]+"/g,
        /AWS_SECRET_ACCESS_KEY="[^"]+"/g,
        /AWS_SESSION_TOKEN="[^"]+"/g,
        /GITHUB_TOKEN="[^"]+"/g,
        /AKIA[0-9A-Z]{16}/g,  // AWS Access Key pattern
        /[a-zA-Z0-9/+=]{40}/g  // AWS Secret Key pattern
      ];
      
      sensitivePatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      });
      return sanitized;
    };
    
    logger.error({
      err: {
        message: sanitizeMessage(error.message),
        stack: sanitizeMessage(error.stack)
      },
      repo: repoFullName,
      issue: issueNumber
    }, 'Error processing command with Claude');

    // Generate an error ID for log correlation
    const timestamp = new Date().toISOString();
    const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;
    
    // Log the sanitized error with its ID for correlation
    const sanitizedErrorMessage = sanitizeMessage(error.message);
    const sanitizedErrorStack = error.stack ? sanitizeMessage(error.stack) : null;
    
    logger.error({
      errorId,
      timestamp,
      error: sanitizedErrorMessage,
      stack: sanitizedErrorStack,
      repo: repoFullName,
      issue: issueNumber
    }, 'General error in Claude service (with error reference)');
    
    // Throw a generic error with reference ID, but without sensitive details
    const errorMessage = sanitizeBotMentions(
      `Error processing Claude command (Reference: ${errorId}, Time: ${timestamp})`
    );
    
    throw new Error(errorMessage);
  }
}

module.exports = {
  processCommand
};