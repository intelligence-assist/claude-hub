import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import { DockerUtils } from '../utils/dockerUtils';
import { StartSessionOptions, SessionConfig } from '../types/session';
import chalk from 'chalk';
import ora from 'ora';

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start a new autonomous Claude Code session')
    .argument('<repo>', 'GitHub repository (format: owner/repo or repo)')
    .argument('<command>', 'Command to send to Claude')
    .option('-p, --pr [number]', 'Treat as pull request and optionally specify PR number')
    .option('-b, --branch <branch>', 'Branch name for PR')
    .option('-m, --memory <limit>', 'Memory limit (e.g., "2g")')
    .option('-c, --cpu <shares>', 'CPU shares (e.g., "1024")')
    .option('--pids <limit>', 'Process ID limit (e.g., "256")')
    .action(async (repo, command, options) => {
      await startSession(repo, command, options);
    });
}

async function startSession(
  repo: string, 
  command: string, 
  options: {
    pr?: string | boolean;
    branch?: string;
    memory?: string;
    cpu?: string;
    pids?: string;
  }
): Promise<void> {
  const spinner = ora('Starting autonomous Claude Code session...').start();

  try {
    // Process repo format (owner/repo or just repo)
    let repoFullName = repo;
    if (!repo.includes('/')) {
      const defaultOwner = process.env.DEFAULT_GITHUB_OWNER || 'default-owner';
      repoFullName = `${defaultOwner}/${repo}`;
    }

    // Process PR option
    const isPullRequest = options.pr !== undefined;
    const prNumber = typeof options.pr === 'string' ? parseInt(options.pr, 10) : undefined;

    // Prepare resource limits if specified
    const resourceLimits = (options.memory || options.cpu || options.pids) ? {
      memory: options.memory || '2g',
      cpuShares: options.cpu || '1024',
      pidsLimit: options.pids || '256'
    } : undefined;

    // Session configuration
    const sessionOptions: StartSessionOptions = {
      repoFullName,
      command,
      isPullRequest,
      prNumber,
      branchName: options.branch,
      resourceLimits
    };

    // Initialize utilities
    const sessionManager = new SessionManager();
    const dockerUtils = new DockerUtils();

    // Check if Docker is available
    if (!await dockerUtils.isDockerAvailable()) {
      spinner.fail('Docker is not available. Please install Docker and try again.');
      return;
    }

    // Ensure Docker image exists
    spinner.text = 'Checking Docker image...';
    if (!await dockerUtils.ensureImageExists()) {
      spinner.fail('Failed to ensure Docker image exists.');
      return;
    }

    // Generate session ID and container name
    const sessionId = sessionManager.generateSessionId();
    const containerName = `claude-hub-${sessionId}`;

    // Prepare environment variables for the container
    const envVars = createEnvironmentVars(sessionOptions);

    // Start the container
    spinner.text = 'Starting Docker container...';
    const containerId = await dockerUtils.startContainer(
      containerName,
      envVars,
      resourceLimits
    );

    if (!containerId) {
      spinner.fail('Failed to start Docker container.');
      return;
    }

    // Create and save session
    const session: Omit<SessionConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      repoFullName: sessionOptions.repoFullName,
      containerId,
      command: sessionOptions.command,
      status: 'running',
      isPullRequest: sessionOptions.isPullRequest,
      prNumber: sessionOptions.prNumber,
      branchName: sessionOptions.branchName,
      resourceLimits: sessionOptions.resourceLimits
    };

    const savedSession = sessionManager.createSession(session);

    spinner.succeed(`Started autonomous session with ID: ${chalk.green(savedSession.id)}`);
    console.log();
    console.log(`${chalk.blue('Session details:')}`);
    console.log(`  ${chalk.yellow('Repository:')} ${savedSession.repoFullName}`);
    console.log(`  ${chalk.yellow('Command:')} ${savedSession.command}`);
    if (savedSession.isPullRequest) {
      console.log(`  ${chalk.yellow('PR:')} #${savedSession.prNumber || 'N/A'}`);
      if (savedSession.branchName) {
        console.log(`  ${chalk.yellow('Branch:')} ${savedSession.branchName}`);
      }
    }
    console.log();
    console.log(`To view logs: ${chalk.cyan(`claude-hub logs ${savedSession.id}`)}`);
    console.log(`To continue session: ${chalk.cyan(`claude-hub continue ${savedSession.id} "Additional command"`)}`);
    console.log(`To stop session: ${chalk.cyan(`claude-hub stop ${savedSession.id}`)}`);

  } catch (error) {
    spinner.fail(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create environment variables for container
 */
function createEnvironmentVars(options: StartSessionOptions): Record<string, string> {
  // Get GitHub token from environment or secure storage
  const githubToken = process.env.GITHUB_TOKEN || '';
  if (!githubToken) {
    console.warn('Warning: No GitHub token found. Set GITHUB_TOKEN environment variable.');
  }

  // Get Anthropic API key from environment or secure storage
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!anthropicApiKey) {
    console.warn('Warning: No Anthropic API key found. Set ANTHROPIC_API_KEY environment variable.');
  }

  return {
    REPO_FULL_NAME: options.repoFullName,
    ISSUE_NUMBER: options.prNumber ? String(options.prNumber) : '',
    IS_PULL_REQUEST: options.isPullRequest ? 'true' : 'false',
    BRANCH_NAME: options.branchName || '',
    OPERATION_TYPE: 'default',
    COMMAND: createPrompt(options),
    GITHUB_TOKEN: githubToken,
    ANTHROPIC_API_KEY: anthropicApiKey,
    BOT_USERNAME: process.env.BOT_USERNAME || 'ClaudeBot',
    BOT_EMAIL: process.env.BOT_EMAIL || 'claude@example.com'
  };
}

/**
 * Create prompt based on context
 */
function createPrompt(options: StartSessionOptions): string {
  return `You are ${process.env.BOT_USERNAME || 'ClaudeBot'}, an AI assistant working autonomously on a GitHub ${options.isPullRequest ? 'pull request' : 'repository'}.

**Context:**
- Repository: ${options.repoFullName}
${options.isPullRequest ? `- Pull Request Number: #${options.prNumber || 'N/A'}` : ''}
${options.branchName ? `- Branch: ${options.branchName}` : ''}
- Running in: Autonomous mode

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
7. **Markdown Formatting:**
   - When your response contains markdown, return it as properly formatted markdown
   - Do NOT escape or encode special characters like newlines (\\n) or quotes
   - Return clean, human-readable markdown that GitHub will render correctly
8. **Progress Acknowledgment:**
   - For larger or complex tasks, first acknowledge the request
   - Post a brief comment describing your plan before starting
   - Use 'gh issue comment' or 'gh pr comment' to post this acknowledgment
   - This lets the user know their request was received and is being processed

**User Request:**
${options.command}

Please complete this task fully and autonomously.`;
}