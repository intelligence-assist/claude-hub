import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import { DockerUtils } from '../utils/dockerUtils';
import chalk from 'chalk';
import ora from 'ora';

export function registerContinueCommand(program: Command): void {
  program
    .command('continue')
    .description('Continue an autonomous Claude Code session with a new command')
    .argument('<id>', 'Session ID')
    .argument('<command>', 'Additional command to send to Claude')
    .action(async (id, command) => {
      await continueSession(id, command);
    });
}

async function continueSession(id: string, command: string): Promise<void> {
  const spinner = ora('Continuing session...').start();

  try {
    const sessionManager = new SessionManager();
    const dockerUtils = new DockerUtils();
    
    // Get session by ID
    const session = sessionManager.getSession(id);
    if (!session) {
      spinner.fail(`Session with ID ${id} not found`);
      return;
    }
    
    // Check if container is running
    const isRunning = await dockerUtils.isContainerRunning(session.containerId);
    if (!isRunning) {
      if (session.status === 'running') {
        // Update session status to stopped
        sessionManager.updateSessionStatus(id, 'stopped');
      }
      
      spinner.fail(`Session ${id} is not running (status: ${session.status}). Cannot continue.`);
      return;
    }
    
    // Prepare the continuation command
    spinner.text = 'Sending command to session...';
    
    // Create a script to execute in the container
    const continuationScript = `
#!/bin/bash
cd /workspace/repo

# Save the command to a file
cat > /tmp/continuation_command.txt << 'EOL'
${command}
EOL

# Run Claude with the continuation command
sudo -u node -E env \\
    HOME="${process.env.HOME || '/home/node'}" \\
    PATH="/usr/local/bin:/usr/local/share/npm-global/bin:$PATH" \\
    ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY || ''}" \\
    GH_TOKEN="${process.env.GITHUB_TOKEN || ''}" \\
    GITHUB_TOKEN="${process.env.GITHUB_TOKEN || ''}" \\
    /usr/local/share/npm-global/bin/claude \\
    --allowedTools "Bash,Create,Edit,Read,Write,GitHub" \\
    --verbose \\
    --print "$(cat /tmp/continuation_command.txt)"
`;

    // Execute the script in the container
    await dockerUtils.executeCommand(session.containerId, continuationScript);
    
    // Update session with the additional command
    session.command += `\n\nContinuation: ${command}`;
    session.updatedAt = new Date().toISOString();
    sessionManager.saveSession(session);
    
    spinner.succeed(`Command sent to session ${chalk.green(id)}`);
    console.log();
    console.log(`${chalk.blue('Session details:')}`);
    console.log(`  ${chalk.yellow('Repository:')} ${session.repoFullName}`);
    console.log(`  ${chalk.yellow('Status:')} ${chalk.green('running')}`);
    console.log(`  ${chalk.yellow('Container:')} ${session.containerId}`);
    console.log();
    console.log(`To view logs: ${chalk.cyan(`claude-hub logs ${session.id}`)}`);
    console.log(`To stop session: ${chalk.cyan(`claude-hub stop ${session.id}`)}`);
    
  } catch (error) {
    spinner.fail(`Failed to continue session: ${error instanceof Error ? error.message : String(error)}`);
  }
}