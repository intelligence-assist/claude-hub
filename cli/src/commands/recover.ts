import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import chalk from 'chalk';
import ora from 'ora';

export function registerRecoverCommand(program: Command): void {
  program
    .command('recover')
    .description('Recover a stopped Claude Code session by recreating its container')
    .argument('<id>', 'Session ID to recover')
    .action(async (id) => {
      await recoverSession(id);
    });

  program
    .command('sync')
    .description('Synchronize session status with container status')
    .action(async () => {
      await syncSessions();
    });
}

async function recoverSession(id: string): Promise<void> {
  const spinner = ora(`Recovering session ${id}...`).start();

  try {
    const sessionManager = new SessionManager();
    
    // Get session by ID
    const session = sessionManager.getSession(id);
    if (!session) {
      spinner.fail(`Session with ID ${id} not found`);
      return;
    }
    
    // Check if session is stopped
    if (session.status !== 'stopped') {
      spinner.info(`Session ${id} is not stopped (status: ${session.status}). Only stopped sessions can be recovered.`);
      return;
    }
    
    // Recover the session
    const recovered = await sessionManager.recoverSession(id);
    
    if (recovered) {
      spinner.succeed(`Recovered session ${id} successfully`);
      console.log();
      console.log(`${chalk.blue('Session details:')}`);
      console.log(`  ${chalk.yellow('Repository:')} ${session.repoFullName}`);
      console.log(`  ${chalk.yellow('Command:')} ${session.command}`);
      
      if (session.isPullRequest) {
        console.log(`  ${chalk.yellow('PR:')} #${session.prNumber || 'N/A'}`);
        if (session.branchName) {
          console.log(`  ${chalk.yellow('Branch:')} ${session.branchName}`);
        }
      } else if (session.isIssue) {
        console.log(`  ${chalk.yellow('Issue:')} #${session.issueNumber}`);
      }
      
      console.log();
      console.log(`To view logs: ${chalk.cyan(`claude-hub logs ${session.id}`)}`);
      console.log(`To continue session: ${chalk.cyan(`claude-hub continue ${session.id} "Additional command"`)}`);
      console.log(`To stop session: ${chalk.cyan(`claude-hub stop ${session.id}`)}`);
    } else {
      spinner.fail(`Failed to recover session ${id}`);
    }
    
  } catch (error) {
    spinner.fail(`Error recovering session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function syncSessions(): Promise<void> {
  const spinner = ora('Synchronizing session statuses...').start();

  try {
    const sessionManager = new SessionManager();
    
    // Sync session statuses
    await sessionManager.syncSessionStatuses();
    
    // Get updated sessions
    const sessions = await sessionManager.listSessions();
    
    spinner.succeed(`Synchronized ${sessions.length} sessions`);
    
    // Display running sessions
    const runningSessions = sessions.filter(s => s.status === 'running');
    const stoppedSessions = sessions.filter(s => s.status === 'stopped');
    
    console.log();
    console.log(`${chalk.green('Running sessions:')} ${runningSessions.length}`);
    console.log(`${chalk.yellow('Stopped sessions:')} ${stoppedSessions.length}`);
    
    if (stoppedSessions.length > 0) {
      console.log();
      console.log(`To recover a stopped session: ${chalk.cyan('claude-hub recover <id>')}`);
    }
    
  } catch (error) {
    spinner.fail(`Error synchronizing sessions: ${error instanceof Error ? error.message : String(error)}`);
  }
}