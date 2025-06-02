import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import { DockerUtils } from '../utils/dockerUtils';
import chalk from 'chalk';
import ora from 'ora';

export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop an autonomous Claude Code session')
    .argument('<id>', 'Session ID or "all" to stop all running sessions')
    .option('-f, --force', 'Force stop (kill) the container')
    .option('--remove', 'Remove the session after stopping')
    .action(async (id, options) => {
      if (id.toLowerCase() === 'all') {
        await stopAllSessions(options);
      } else {
        await stopSession(id, options);
      }
    });
}

async function stopSession(
  id: string, 
  options: { 
    force?: boolean; 
    remove?: boolean;
  }
): Promise<void> {
  const spinner = ora(`Stopping session ${id}...`).start();

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
        spinner.info(`Session ${id} was already stopped, updated status.`);
      } else {
        spinner.info(`Session ${id} is already stopped (status: ${session.status}).`);
      }
      
      // If remove option is set, remove the session
      if (options.remove) {
        sessionManager.deleteSession(id);
        spinner.succeed(`Session ${id} removed from records.`);
      }
      
      return;
    }
    
    // Stop the container
    spinner.text = `Stopping container ${session.containerId}...`;
    const stopped = await dockerUtils.stopContainer(session.containerId, options.force);
    
    if (!stopped) {
      spinner.fail(`Failed to stop container ${session.containerId}`);
      return;
    }
    
    // Update session status to stopped
    sessionManager.updateSessionStatus(id, 'stopped');
    
    // If remove option is set, remove the session
    if (options.remove) {
      sessionManager.deleteSession(id);
      spinner.succeed(`Session ${id} stopped and removed.`);
    } else {
      spinner.succeed(`Session ${id} stopped.`);
    }
    
  } catch (error) {
    spinner.fail(`Failed to stop session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function stopAllSessions(
  options: { 
    force?: boolean; 
    remove?: boolean;
  }
): Promise<void> {
  const spinner = ora('Stopping all running sessions...').start();

  try {
    const sessionManager = new SessionManager();
    const dockerUtils = new DockerUtils();
    
    // Get all running sessions
    const sessions = sessionManager.listSessions({ status: 'running' });
    
    if (sessions.length === 0) {
      spinner.info('No running sessions found.');
      return;
    }
    
    spinner.text = `Stopping ${sessions.length} sessions...`;
    
    let stoppedCount = 0;
    let failedCount = 0;
    
    // Stop each session
    for (const session of sessions) {
      try {
        // Check if container is actually running
        const isRunning = await dockerUtils.isContainerRunning(session.containerId);
        if (!isRunning) {
          // Update session status to stopped
          sessionManager.updateSessionStatus(session.id, 'stopped');
          stoppedCount++;
          continue;
        }
        
        // Stop the container
        const stopped = await dockerUtils.stopContainer(session.containerId, options.force);
        
        if (stopped) {
          // Update session status to stopped
          sessionManager.updateSessionStatus(session.id, 'stopped');
          
          // If remove option is set, remove the session
          if (options.remove) {
            sessionManager.deleteSession(session.id);
          }
          
          stoppedCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }
    
    if (failedCount > 0) {
      spinner.warn(`Stopped ${stoppedCount} sessions, failed to stop ${failedCount} sessions.`);
    } else {
      spinner.succeed(`Stopped all ${stoppedCount} running sessions.`);
    }
    
    if (options.remove) {
      console.log(`${chalk.yellow('Note:')} Removed stopped sessions from records.`);
    }
    
  } catch (error) {
    spinner.fail(`Failed to stop sessions: ${error instanceof Error ? error.message : String(error)}`);
  }
}