import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import { DockerUtils } from '../utils/dockerUtils';
import chalk from 'chalk';
import ora from 'ora';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .description('View logs from a Claude Code session')
    .argument('<id>', 'Session ID')
    .option('-f, --follow', 'Follow log output')
    .option('-t, --tail <number>', 'Number of lines to show from the end of the logs', '100')
    .action(async (id, options) => {
      await showLogs(id, options);
    });
}

async function showLogs(
  id: string, 
  options: { 
    follow?: boolean; 
    tail?: string;
  }
): Promise<void> {
  try {
    const sessionManager = new SessionManager();
    const dockerUtils = new DockerUtils();
    
    // Get session by ID
    const session = sessionManager.getSession(id);
    if (!session) {
      console.error(`Session with ID ${id} not found`);
      return;
    }
    
    // Validate tail option
    let tail: number | undefined = undefined;
    if (options.tail) {
      tail = parseInt(options.tail, 10);
      if (isNaN(tail) || tail < 0) {
        console.error('Tail must be a non-negative number');
        return;
      }
    }
    
    // Check if container exists and is running
    const isRunning = await dockerUtils.isContainerRunning(session.containerId);
    if (!isRunning && session.status === 'running') {
      console.log(`Session ${id} container is not running, but was marked as running. Updating status...`);
      sessionManager.updateSessionStatus(id, 'stopped');
      session.status = 'stopped';
    }
    
    console.log(`${chalk.blue('Session details:')}`);
    console.log(`  ${chalk.yellow('ID:')} ${session.id}`);
    console.log(`  ${chalk.yellow('Repository:')} ${session.repoFullName}`);
    console.log(`  ${chalk.yellow('Status:')} ${getStatusWithColor(session.status)}`);
    console.log(`  ${chalk.yellow('Container ID:')} ${session.containerId}`);
    console.log(`  ${chalk.yellow('Created:')} ${new Date(session.createdAt).toLocaleString()}`);
    console.log();
    
    // In case of follow mode and session not running, warn the user
    if (options.follow && session.status !== 'running') {
      console.warn(chalk.yellow(`Warning: Session is not running (status: ${session.status}). --follow may not show new logs.`));
    }
    
    // Show spinner while fetching logs
    const spinner = ora('Fetching logs...').start();
    
    try {
      if (options.follow) {
        spinner.stop();
        console.log(chalk.cyan('Streaming logs... (Press Ctrl+C to exit)'));
        console.log(chalk.gray('─'.repeat(80)));
        
        // For follow mode, we need to handle streaming differently
        await dockerUtils.getContainerLogs(session.containerId, true, tail);
      } else {
        // Get logs
        const logs = await dockerUtils.getContainerLogs(session.containerId, false, tail);
        spinner.stop();
        
        console.log(chalk.cyan('Logs:'));
        console.log(chalk.gray('─'.repeat(80)));
        console.log(logs);
        console.log(chalk.gray('─'.repeat(80)));
      }
    } catch (error) {
      spinner.fail(`Failed to retrieve logs: ${error instanceof Error ? error.message : String(error)}`);
    }
    
  } catch (error) {
    console.error(`Error showing logs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getStatusWithColor(status: string): string {
  switch (status) {
    case 'running':
      return chalk.green('running');
    case 'completed':
      return chalk.blue('completed');
    case 'failed':
      return chalk.red('failed');
    case 'stopped':
      return chalk.yellow('stopped');
    default:
      return status;
  }
}