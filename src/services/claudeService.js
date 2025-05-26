const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { createLogger } = require('../utils/logger');
// const awsCredentialProvider = require('../utils/awsCredentialProvider');
const { sanitizeBotMentions } = require('../utils/sanitize');
const secureCredentials = require('../utils/secureCredentials');

const logger = createLogger('claudeService');

// Get bot username from environment variables - required
const BOT_USERNAME = process.env.BOT_USERNAME;

// Validate bot username is set
if (!BOT_USERNAME) {
  logger.error(
    'BOT_USERNAME environment variable is not set in claudeService. This is required to prevent infinite loops.'
  );
  throw new Error('BOT_USERNAME environment variable is required');
}

// Using the shared sanitization utility from utils/sanitize.js

// Artifact storage configuration
const ARTIFACT_BASE_DIR = path.join(os.homedir(), '.claude-webhook', 'artifacts');
const ARTIFACT_RETENTION_DAYS = 30; // Keep artifacts for 30 days

/**
 * Validates repository name format and prevents path traversal
 */
function validateRepoFullName(repoFullName) {
  if (!repoFullName || typeof repoFullName !== 'string') {
    throw new Error('Invalid repository name: must be a non-empty string');
  }
  
  // Check format: owner/repo
  const parts = repoFullName.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid repository name format: must be owner/repo');
  }
  
  const [owner, repo] = parts;
  
  // Validate owner and repo names (GitHub naming rules)
  const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*$/;
  if (!validNamePattern.test(owner) || !validNamePattern.test(repo)) {
    throw new Error('Invalid repository name: contains invalid characters');
  }
  
  // Prevent path traversal attempts
  if (owner.includes('..') || repo.includes('..') || 
      owner.includes('/') || repo.includes('/') ||
      owner.includes('\\') || repo.includes('\\')) {
    throw new Error('Invalid repository name: potential path traversal detected');
  }
  
  return { owner, repo };
}

/**
 * Ensures the artifact directory exists with proper permissions
 */
async function ensureArtifactDirectory(repoFullName) {
  const { owner, repo } = validateRepoFullName(repoFullName);
  const artifactDir = path.join(ARTIFACT_BASE_DIR, owner, repo);
  
  try {
    await fs.mkdir(artifactDir, { recursive: true, mode: 0o700 });
    return artifactDir;
  } catch (error) {
    logger.error({ error: error.message, artifactDir }, 'Failed to create artifact directory');
    throw error;
  }
}

/**
 * Sanitizes string for safe storage
 */
function sanitizeForStorage(str, maxLength = 1000) {
  if (!str || typeof str !== 'string') return '';
  // Remove null bytes and control characters except newlines and tabs
  return str
    .substring(0, maxLength)
    .replace(/\0/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Saves Claude output as an artifact
 */
async function saveArtifact({ repoFullName, issueNumber, operationType, command, output, metadata = {} }) {
  try {
    const artifactDir = await ensureArtifactDirectory(repoFullName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeOperationType = operationType.replace(/[^a-zA-Z0-9-]/g, '_');
    
    // Validate issue number
    const safeIssueNumber = issueNumber ? parseInt(issueNumber, 10) : null;
    if (issueNumber && (!safeIssueNumber || safeIssueNumber < 1)) {
      throw new Error('Invalid issue number');
    }
    
    const filename = `${timestamp}_${safeIssueNumber || 'direct'}_${safeOperationType}.json`;
    const filepath = path.join(artifactDir, filename);
    
    const artifact = {
      timestamp: new Date().toISOString(),
      repository: repoFullName,
      issueNumber: safeIssueNumber,
      operationType: sanitizeForStorage(operationType, 100),
      command: sanitizeForStorage(command, 1000),
      output: sanitizeForStorage(output, 1000000), // 1MB limit
      metadata: {
        ...metadata,
        outputLength: output.length,
        savedAt: new Date().toISOString()
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(artifact, null, 2), { mode: 0o600 });
    
    logger.info({ 
      filepath, 
      repo: repoFullName, 
      issue: issueNumber,
      operationType,
      outputLength: output.length 
    }, 'Artifact saved successfully');
    
    return filepath;
  } catch (error) {
    // Log error but don't fail the main operation
    logger.error({ 
      error: error.message, 
      repo: repoFullName, 
      issue: issueNumber 
    }, 'Failed to save artifact');
    return null;
  }
}

/**
 * Cleans up old artifacts based on retention policy
 */
async function cleanupOldArtifacts() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARTIFACT_RETENTION_DAYS);
    
    async function cleanDirectory(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await cleanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            const stats = await fs.stat(fullPath);
            if (stats.mtime < cutoffDate) {
              await fs.unlink(fullPath);
              logger.debug({ filepath: fullPath }, 'Deleted old artifact');
            }
          }
        }
      } catch (error) {
        logger.error({ error: error.message, dir }, 'Error cleaning directory');
      }
    }
    
    await cleanDirectory(ARTIFACT_BASE_DIR);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to cleanup old artifacts');
  }
}

/**
 * Processes a command using Claude Code CLI
 *
 * @param {Object} options - The options for processing the command
 * @param {string} options.repoFullName - The full name of the repository (owner/repo)
 * @param {number|null} options.issueNumber - The issue number (can be null for direct API calls)
 * @param {string} options.command - The command to process with Claude
 * @param {boolean} [options.isPullRequest=false] - Whether this is a pull request
 * @param {string} [options.branchName] - The branch name for pull requests
 * @param {string} [options.operationType='default'] - Operation type: 'auto-tagging', 'pr-review', or 'default'
 * @returns {Promise<string>} - Claude's response
 */
async function processCommand({
  repoFullName,
  issueNumber,
  command,
  isPullRequest = false,
  branchName = null,
  operationType = 'default'
}) {
  const startTime = Date.now();
  
  try {
    logger.info(
      {
        repo: repoFullName,
        issue: issueNumber,
        isPullRequest,
        branchName,
        commandLength: command.length
      },
      'Processing command with Claude'
    );

    const githubToken = secureCredentials.get('GITHUB_TOKEN');

    // In test mode, skip execution and return a mock response
    if (process.env.NODE_ENV === 'test' || !githubToken || !githubToken.includes('ghp_')) {
      logger.info(
        {
          repo: repoFullName,
          issue: issueNumber
        },
        'TEST MODE: Skipping Claude execution'
      );

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
    const dockerImageName = process.env.CLAUDE_CONTAINER_IMAGE || 'claude-code-runner:latest';
    try {
      execFileSync('docker', ['inspect', dockerImageName], { stdio: 'ignore' });
      logger.info({ dockerImageName }, 'Docker image already exists');
    } catch (_e) {
      logger.info({ dockerImageName }, 'Building Docker image for Claude Code runner');
      execFileSync('docker', ['build', '-f', 'Dockerfile.claudecode', '-t', dockerImageName, '.'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });
    }

    // Select appropriate entrypoint script based on operation type
    let entrypointScript;
    switch (operationType) {
    case 'auto-tagging':
      entrypointScript = '/scripts/runtime/claudecode-tagging-entrypoint.sh';
      logger.info({ operationType }, 'Using minimal tools for auto-tagging operation');
      break;
    case 'pr-review':
    case 'default':
    default:
      entrypointScript = '/scripts/runtime/claudecode-entrypoint.sh';
      logger.info({ operationType }, 'Using full tool set for standard operation');
      break;
    }

    // Create unique container name (sanitized to prevent command injection)
    const sanitizedRepoName = repoFullName.replace(/[^a-zA-Z0-9\-_]/g, '-');
    const containerName = `claude-${sanitizedRepoName}-${Date.now()}`;

    // Create the full prompt with context and instructions based on operation type
    let fullPrompt;
    
    if (operationType === 'auto-tagging') {
      fullPrompt = `You are Claude, an AI assistant analyzing a GitHub issue for automatic label assignment.

**Context:**
- Repository: ${repoFullName}
- Issue Number: #${issueNumber}
- Operation: Auto-tagging (Read-only + Label assignment)

**Available Tools:**
- Read: Access repository files and issue content
- GitHub: Use 'gh' CLI for label operations only

**Task:**
Analyze the issue and apply appropriate labels using GitHub CLI commands. Use these categories:
- Priority: critical, high, medium, low
- Type: bug, feature, enhancement, documentation, question, security
- Complexity: trivial, simple, moderate, complex
- Component: api, frontend, backend, database, auth, webhook, docker

**Process:**
1. First run 'gh label list' to see available labels
2. Analyze the issue content
3. Use 'gh issue edit #{issueNumber} --add-label "label1,label2,label3"' to apply labels
4. Do NOT comment on the issue - only apply labels

**User Request:**
${command}

Complete the auto-tagging task using only the minimal required tools.`;
    } else {
      fullPrompt = `You are Claude, an AI assistant responding to a GitHub ${isPullRequest ? 'pull request' : 'issue'} via the ${BOT_USERNAME} webhook.

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
    }

    // Prepare environment variables for the container
    const envVars = {
      REPO_FULL_NAME: repoFullName,
      ISSUE_NUMBER: issueNumber || '',
      IS_PULL_REQUEST: isPullRequest ? 'true' : 'false',
      BRANCH_NAME: branchName || '',
      OPERATION_TYPE: operationType,
      COMMAND: fullPrompt,
      GITHUB_TOKEN: githubToken,
      ANTHROPIC_API_KEY: secureCredentials.get('ANTHROPIC_API_KEY')
    };

    // Note: Environment variables will be added as separate arguments to docker command
    // This is safer than building a shell command string

    // Run the container
    logger.info(
      {
        containerName,
        repo: repoFullName,
        isPullRequest,
        branch: branchName
      },
      'Starting Claude Code container'
    );

    // Build docker run command as an array to prevent command injection
    const dockerArgs = [
      'run',
      '--rm'
    ];
    
    // Apply container security constraints based on environment variables
    if (process.env.CLAUDE_CONTAINER_PRIVILEGED === 'true') {
      dockerArgs.push('--privileged');
    } else {
      // Apply only necessary capabilities instead of privileged mode
      const requiredCapabilities = [
        'NET_ADMIN',   // Required for firewall setup
        'SYS_ADMIN'    // Required for certain filesystem operations
      ];
      
      // Add optional capabilities
      const optionalCapabilities = {
        'NET_RAW': process.env.CLAUDE_CONTAINER_CAP_NET_RAW === 'true',
        'SYS_TIME': process.env.CLAUDE_CONTAINER_CAP_SYS_TIME === 'true',
        'DAC_OVERRIDE': process.env.CLAUDE_CONTAINER_CAP_DAC_OVERRIDE === 'true',
        'AUDIT_WRITE': process.env.CLAUDE_CONTAINER_CAP_AUDIT_WRITE === 'true'
      };
      
      // Add required capabilities
      requiredCapabilities.forEach(cap => {
        dockerArgs.push(`--cap-add=${cap}`);
      });
      
      // Add optional capabilities if enabled
      Object.entries(optionalCapabilities).forEach(([cap, enabled]) => {
        if (enabled) {
          dockerArgs.push(`--cap-add=${cap}`);
        }
      });
      
      // Add resource limits
      dockerArgs.push(
        '--memory', process.env.CLAUDE_CONTAINER_MEMORY_LIMIT || '2g',
        '--cpu-shares', process.env.CLAUDE_CONTAINER_CPU_SHARES || '1024',
        '--pids-limit', process.env.CLAUDE_CONTAINER_PIDS_LIMIT || '256'
      );
    }
    
    // Add container name
    dockerArgs.push('--name', containerName);

    // Add environment variables as separate arguments
    Object.entries(envVars)
      .filter(([_, value]) => value !== undefined && value !== '')
      .forEach(([key, value]) => {
        // For long commands, we need to pass them differently
        // Docker doesn't support reading env values from files with @ syntax
        if (key === 'COMMAND' && String(value).length > 500) {
          // We'll pass the command via stdin or mount it as a volume
          // For now, let's just pass it directly but properly escaped
          dockerArgs.push('-e', `${key}=${String(value)}`);
        } else {
          dockerArgs.push('-e', `${key}=${String(value)}`);
        }
      });

    // Add the image name and custom entrypoint
    dockerArgs.push('--entrypoint', entrypointScript, dockerImageName);

    // Create sanitized version for logging (remove sensitive values)
    const sanitizedArgs = dockerArgs.map(arg => {
      if (typeof arg !== 'string') return arg;
      
      // Check if this is an environment variable assignment
      const envMatch = arg.match(/^([A-Z_]+)=(.*)$/);
      if (envMatch) {
        const envKey = envMatch[1];
        const sensitiveSKeys = [
          'GITHUB_TOKEN',
          'ANTHROPIC_API_KEY',
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
          'AWS_SESSION_TOKEN'
        ];
        if (sensitiveSKeys.includes(envKey)) {
          return `${envKey}=[REDACTED]`;
        }
        // For the command, also redact to avoid logging the full command
        if (envKey === 'COMMAND') {
          return `${envKey}=[COMMAND_CONTENT]`;
        }
      }
      return arg;
    });

    try {
      logger.info({ dockerArgs: sanitizedArgs }, 'Executing Docker command');

      // No longer using temp files for commands

      // Get container lifetime from environment variable or use default (2 hours)
      const containerLifetimeMs = parseInt(process.env.CONTAINER_LIFETIME_MS, 10) || 7200000; // 2 hours in milliseconds
      logger.info({ containerLifetimeMs }, 'Setting container lifetime');

      // Use promisified version of child_process.execFile (safer than exec)
      const { promisify } = require('util');
      const execFileAsync = promisify(require('child_process').execFile);
      
      const result = await execFileAsync('docker', dockerArgs, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: containerLifetimeMs // Container lifetime in milliseconds
      });

      // No cleanup needed anymore

      let responseText = result.stdout.trim();

      // Check for empty response
      if (!responseText) {
        logger.warn(
          {
            containerName,
            repo: repoFullName,
            issue: issueNumber
          },
          'Empty response from Claude Code container'
        );

        // Try to get container logs as the response instead
        try {
          responseText = execFileSync('docker', ['logs', containerName], {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          logger.info('Retrieved response from container logs');
        } catch (e) {
          logger.error(
            {
              error: e.message,
              containerName
            },
            'Failed to get container logs as fallback'
          );
        }
      }

      // Sanitize response to prevent infinite loops by removing bot mentions
      responseText = sanitizeBotMentions(responseText);

      // Save the full output as an artifact
      await saveArtifact({
        repoFullName,
        issueNumber,
        operationType,
        command,
        output: responseText,
        metadata: {
          containerName,
          executionTime: Date.now() - startTime,
          isPullRequest,
          branchName
        }
      });

      logger.info(
        {
          repo: repoFullName,
          issue: issueNumber,
          responseLength: responseText.length,
          containerName,
          stdout: responseText.substring(0, 500) // Log first 500 chars
        },
        'Claude Code execution completed successfully'
      );

      return responseText;
    } catch (error) {
      // No cleanup needed - we're not using temp files anymore

      // Sanitize stderr and stdout to remove any potential credentials
      const sanitizeOutput = output => {
        if (!output) return output;
        // Import the sanitization utility
        let sanitized = output.toString();

        // Sensitive values to redact
        const sensitiveValues = [
          githubToken,
          secureCredentials.get('ANTHROPIC_API_KEY'),
          envVars.AWS_ACCESS_KEY_ID,
          envVars.AWS_SECRET_ACCESS_KEY,
          envVars.AWS_SESSION_TOKEN
        ].filter(val => val && val.length > 0);

        // Redact specific sensitive values first
        sensitiveValues.forEach(value => {
          if (value) {
            // Convert to string and escape regex special characters
            const stringValue = String(value);
            // Escape regex special characters
            const escapedValue = stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            sanitized = sanitized.replace(new RegExp(escapedValue, 'g'), '[REDACTED]');
          }
        });
        
        // Then apply pattern-based redaction for any missed credentials
        const sensitivePatterns = [
          /AKIA[0-9A-Z]{16}/g, // AWS Access Key pattern
          /[a-zA-Z0-9/+=]{40}/g, // AWS Secret Key pattern
          /sk-[a-zA-Z0-9]{32,}/g, // API key pattern
          /github_pat_[a-zA-Z0-9_]{82}/g, // GitHub fine-grained token pattern
          /ghp_[a-zA-Z0-9]{36}/g // GitHub personal access token pattern
        ];

        sensitivePatterns.forEach(pattern => {
          sanitized = sanitized.replace(pattern, '[REDACTED]');
        });
        
        return sanitized;
      };

      // Check for specific error types
      const errorMsg = error.message || '';
      const errorOutput = error.stderr ? error.stderr.toString() : '';

      // Check if this is a docker image not found error
      if (
        errorOutput.includes('Unable to find image') ||
        errorMsg.includes('Unable to find image')
      ) {
        logger.error('Docker image not found. Attempting to rebuild...');
        try {
          execFileSync('docker', ['build', '-f', 'Dockerfile.claudecode', '-t', dockerImageName, '.'], {
            cwd: path.join(__dirname, '../..'),
            stdio: 'pipe'
          });
          logger.info('Successfully rebuilt Docker image');
        } catch (rebuildError) {
          logger.error(
            {
              error: rebuildError.message
            },
            'Failed to rebuild Docker image'
          );
        }
      }

      logger.error(
        {
          error: error.message,
          stderr: sanitizeOutput(error.stderr),
          stdout: sanitizeOutput(error.stdout),
          containerName,
          dockerArgs: sanitizedArgs
        },
        'Error running Claude Code container'
      );

      // Try to get container logs for debugging
      try {
        const logs = execFileSync('docker', ['logs', containerName], {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        logger.error({ containerLogs: logs }, 'Container logs');
      } catch (e) {
        logger.error({ error: e.message }, 'Failed to get container logs');
      }

      // Try to clean up the container if it's still running
      try {
        execFileSync('docker', ['kill', containerName], { stdio: 'ignore' });
      } catch {
        // Container might already be stopped
      }

      // Generate an error ID for log correlation
      const timestamp = new Date().toISOString();
      const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;

      // Log the detailed error with full context
      const sanitizedStderr = sanitizeOutput(error.stderr);
      const sanitizedStdout = sanitizeOutput(error.stdout);

      logger.error(
        {
          errorId,
          timestamp,
          error: error.message,
          stderr: sanitizedStderr,
          stdout: sanitizedStdout,
          containerName,
          dockerArgs: sanitizedArgs,
          repo: repoFullName,
          issue: issueNumber
        },
        'Claude Code container execution failed (with error reference)'
      );

      // Throw a generic error with reference ID, but without sensitive details
      const errorMessage = sanitizeBotMentions(
        `Error executing Claude command (Reference: ${errorId}, Time: ${timestamp})`
      );

      throw new Error(errorMessage);
    }
  } catch (error) {
    // Sanitize the error message to remove any credentials
    const sanitizeMessage = message => {
      if (!message) return message;
      let sanitized = message;
      const sensitivePatterns = [
        /AWS_ACCESS_KEY_ID="[^"]+"/g,
        /AWS_SECRET_ACCESS_KEY="[^"]+"/g,
        /AWS_SESSION_TOKEN="[^"]+"/g,
        /GITHUB_TOKEN="[^"]+"/g,
        /ANTHROPIC_API_KEY="[^"]+"/g,
        /AKIA[0-9A-Z]{16}/g, // AWS Access Key pattern
        /[a-zA-Z0-9/+=]{40}/g, // AWS Secret Key pattern
        /sk-[a-zA-Z0-9]{32,}/g, // API key pattern
        /github_pat_[a-zA-Z0-9_]{82}/g, // GitHub fine-grained token pattern
        /ghp_[a-zA-Z0-9]{36}/g // GitHub personal access token pattern
      ];

      sensitivePatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      });
      return sanitized;
    };

    logger.error(
      {
        err: {
          message: sanitizeMessage(error.message),
          stack: sanitizeMessage(error.stack)
        },
        repo: repoFullName,
        issue: issueNumber
      },
      'Error processing command with Claude'
    );

    // Generate an error ID for log correlation
    const timestamp = new Date().toISOString();
    const errorId = `err-${Math.random().toString(36).substring(2, 10)}`;

    // Log the sanitized error with its ID for correlation
    const sanitizedErrorMessage = sanitizeMessage(error.message);
    const sanitizedErrorStack = error.stack ? sanitizeMessage(error.stack) : null;

    logger.error(
      {
        errorId,
        timestamp,
        error: sanitizedErrorMessage,
        stack: sanitizedErrorStack,
        repo: repoFullName,
        issue: issueNumber
      },
      'General error in Claude service (with error reference)'
    );

    // Throw a generic error with reference ID, but without sensitive details
    const errorMessage = sanitizeBotMentions(
      `Error processing Claude command (Reference: ${errorId}, Time: ${timestamp})`
    );

    throw new Error(errorMessage);
  }
}

// Schedule periodic cleanup of old artifacts
let _cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
  const interval = setInterval(() => {
    cleanupOldArtifacts().catch(error => {
      logger.error({ error: error.message }, 'Scheduled artifact cleanup failed');
    });
  }, 24 * 60 * 60 * 1000); // Run once per day
  
  // Store interval ID for potential cleanup on shutdown
  process.on('SIGTERM', () => clearInterval(interval));
  process.on('SIGINT', () => clearInterval(interval));
}

module.exports = {
  processCommand,
  cleanupOldArtifacts
};
