const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLogger } = require('../utils/logger');
const awsCredentialProvider = require('../utils/awsCredentialProvider');
const { sanitizeBotMentions } = require('../utils/sanitize');
const RepoAnalyzer = require('../utils/repoAnalyzer');

const logger = createLogger('claudeService');

// Get bot username from environment variables - required
const BOT_USERNAME = process.env.BOT_USERNAME;

// Validate bot username is set
if (!BOT_USERNAME) {
  logger.error('BOT_USERNAME environment variable is not set in claudeService. This is required to prevent infinite loops.');
  throw new Error('BOT_USERNAME environment variable is required');
}

// Read container mode setting from environment variables
const CONTAINER_MODE = process.env.CONTAINER_MODE || 'hybrid';

// Configure the repository cache directory
const REPO_CACHE_DIR = process.env.REPO_CACHE_DIR || path.join(os.tmpdir(), 'claude-repo-cache');

// Known repositories - these get special handling
const KNOWN_REPOSITORIES = process.env.KNOWN_REPOSITORIES 
  ? process.env.KNOWN_REPOSITORIES.split(',').map(repo => repo.trim())
  : [];

/**
 * Processes a command using repository analysis for container mode
 * or Claude Code CLI for direct mode
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
      commandLength: command.length,
      containerMode: CONTAINER_MODE
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

    // Different execution modes based on configuration
    if (CONTAINER_MODE === 'direct') {
      // Use the direct Claude Code CLI execution
      return await runDirectMode({ repoFullName, issueNumber, command, isPullRequest, branchName });
    } else if (CONTAINER_MODE === 'container' || CONTAINER_MODE === 'hybrid') {
      // Try the hybrid approach first with repository analysis
      try {
        const hybridResponse = await runHybridMode({ repoFullName, issueNumber, command, isPullRequest, branchName });
        
        // If in hybrid mode and the response is successful, return it
        if (hybridResponse) {
          return hybridResponse;
        }
      } catch (hybridError) {
        logger.warn({ error: hybridError.message }, 'Hybrid mode failed, falling back to direct mode');
        
        // If hybrid mode failed and we're in hybrid mode, try direct mode as fallback
        if (CONTAINER_MODE === 'hybrid') {
          return await runDirectMode({ repoFullName, issueNumber, command, isPullRequest, branchName });
        }
        
        // Otherwise rethrow the error
        throw hybridError;
      }
    }
    
    // Default to direct mode if configuration is invalid
    logger.warn(`Unknown CONTAINER_MODE: ${CONTAINER_MODE}, falling back to direct mode`);
    return await runDirectMode({ repoFullName, issueNumber, command, isPullRequest, branchName });
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

/**
 * Runs Claude Code in a Docker container (original approach)
 */
async function runDirectMode({ repoFullName, issueNumber, command, isPullRequest, branchName }) {
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

  // Add AWS credentials if available
  const awsCredentials = await awsCredentialProvider.getCredentials();
  if (awsCredentials) {
    envVars.AWS_ACCESS_KEY_ID = awsCredentials.accessKeyId;
    envVars.AWS_SECRET_ACCESS_KEY = awsCredentials.secretAccessKey;
    if (awsCredentials.sessionToken) {
      envVars.AWS_SESSION_TOKEN = awsCredentials.sessionToken;
    }
    envVars.AWS_REGION = process.env.AWS_REGION || awsCredentials.region || 'us-east-1';
  }

  // Build docker run command - properly escape values for shell
  const envArgs = Object.entries(envVars)
    .filter(([_, value]) => value !== undefined && value !== '')
    .map(([key, value]) => {
      // Convert to string and escape shell special characters in the value
      const stringValue = String(value);
      // Write complex values to files for safer handling
      if (key === 'COMMAND' && stringValue.length > 500) {
        const tmpFile = `/tmp/claude-command-${Date.now()}.txt`;
        fs.writeFileSync(tmpFile, stringValue);
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
            fs.unlinkSync(file);
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
          fs.unlinkSync(file);
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
}

/**
 * Runs the hybrid approach with repository analysis
 */
async function runHybridMode({ repoFullName, issueNumber, command, isPullRequest, branchName }) {
  logger.info({
    repo: repoFullName,
    issue: issueNumber,
    isPullRequest,
    branch: branchName
  }, 'Running hybrid mode with repository analysis');

  // Create a unique repository cache path
  const repoCachePath = path.join(REPO_CACHE_DIR, repoFullName.replace('/', '-'));

  // Check if this is a known repository
  if (KNOWN_REPOSITORIES.includes(repoFullName)) {
    logger.info({
      repo: repoFullName
    }, 'Using predefined response for known repository');
    
    return generatePredefinedResponse({ repoFullName, issueNumber, command, isPullRequest, branchName });
  }

  // Instantiate the repo analyzer
  const analyzer = new RepoAnalyzer({
    repoPath: repoCachePath,
    repoFullName: repoFullName
  });

  // Clone and analyze the repository
  await analyzer.analyzeRepository(branchName || 'main');

  // Generate a response based on the repository analysis
  return generateAnalysisResponse({ 
    repoFullName, 
    issueNumber, 
    command, 
    isPullRequest, 
    branchName,
    analysis: analyzer.analysis,
    summary: analyzer.generateSummary()
  });
}

/**
 * Generates a predefined response for known repositories
 */
function generatePredefinedResponse({ repoFullName, issueNumber, command, isPullRequest, branchName }) {
  // Example response template - in production, this would be more sophisticated
  // and tailored to the specific repository
  const responseTemplate = `# Hello from Claude!

I've analyzed the repository **${repoFullName}** and I'm here to help with your request:

> ${command}

## Repository Information

This is a known repository in our system. I'm familiar with its structure and common issues.

${isPullRequest 
  ? `I'm analyzing pull request #${issueNumber} on the \`${branchName}\` branch.` 
  : `I'm looking at issue #${issueNumber} on the \`${branchName || 'main'}\` branch.`}

## Response

I'll help you with this request. Let me check the codebase and provide a detailed response.

${getResponseBasedOnCommand(command, repoFullName)}

Is there anything specific you'd like me to explain in more detail?`;

  return sanitizeBotMentions(responseTemplate);
}

/**
 * Generates a simple response based on the command context
 * This is a placeholder for more sophisticated command parsing
 */
function getResponseBasedOnCommand(command, repoFullName) {
  // Extract common request types with simple regex patterns
  if (command.match(/explain|tell me about|what is|how does/i)) {
    return `This looks like an explanation request. I'll analyze the repository structure and provide details about the architecture and key components.`;
  } else if (command.match(/implement|add|create|build/i)) {
    return `This appears to be a request to implement new functionality. I'll help you design and implement this feature in a clean, maintainable way that integrates well with the existing codebase.`;
  } else if (command.match(/fix|resolve|debug|error|issue|bug/i)) {
    return `I understand you're encountering an issue that needs fixing. I'll help diagnose the problem and suggest a solution based on the error information and codebase structure.`;
  } else if (command.match(/review|analyze|assess|evaluate/i)) {
    return `I'll review the code and provide feedback on design, potential issues, and improvement opportunities.`;
  } else if (command.match(/optimize|improve|performance|speed/i)) {
    return `I'll analyze the code for performance bottlenecks and suggest optimizations to improve efficiency.`;
  } else {
    return `I'll help you with this request by analyzing the repository structure and providing a tailored response.`;
  }
}

/**
 * Generates a response based on repository analysis
 */
function generateAnalysisResponse({ repoFullName, issueNumber, command, isPullRequest, branchName, analysis, summary }) {
  // Start with the repository summary
  const repoSummary = summary;

  // Add a response to the specific command
  const commandResponse = `
## Response to Your Request

> ${command}

${getResponseBasedOnCommand(command, repoFullName)}

## Next Steps

Based on your request, here are the recommended next steps:

1. Review the repository structure above to understand the codebase
2. If you need more specific assistance, please provide details about:
   - Which files you're working with
   - Specific functionality you're interested in
   - Any error messages or unexpected behavior you're seeing

I'm here to help you with this ${isPullRequest ? 'pull request' : 'issue'}, so feel free to ask follow-up questions as needed.`;

  // Combine and return
  return sanitizeBotMentions(repoSummary + commandResponse);
}

module.exports = {
  processCommand
};