import { Command } from 'commander';
import { SessionManager } from '../utils/sessionManager';
import { DockerUtils } from '../utils/dockerUtils';
import { SessionStatus } from '../types/session';
import chalk from 'chalk';
import Table from 'cli-table3';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List autonomous Claude Code sessions')
    .option('-s, --status <status>', 'Filter by status (running, completed, failed, stopped)')
    .option('-r, --repo <repo>', 'Filter by repository name')
    .option('-l, --limit <number>', 'Limit number of sessions shown', '10')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await listSessions(options);
    });
}

async function listSessions(options: {
  status?: string;
  repo?: string;
  limit?: string;
  json?: boolean;
}): Promise<void> {
  try {
    const sessionManager = new SessionManager();
    const dockerUtils = new DockerUtils();
    
    // Validate status option if provided
    const validStatuses: SessionStatus[] = ['running', 'completed', 'failed', 'stopped'];
    let status: SessionStatus | undefined = undefined;
    
    if (options.status) {
      if (!validStatuses.includes(options.status as SessionStatus)) {
        console.error(`Invalid status: ${options.status}. Valid values: ${validStatuses.join(', ')}`);
        return;
      }
      status = options.status as SessionStatus;
    }
    
    // Validate limit option
    const limit = options.limit ? parseInt(options.limit, 10) : 10;
    if (isNaN(limit) || limit <= 0) {
      console.error('Limit must be a positive number');
      return;
    }
    
    // Get sessions with filters
    const sessions = await sessionManager.listSessions({
      status,
      repo: options.repo,
      limit
    });
    
    if (sessions.length === 0) {
      if (options.json) {
        console.log('[]');
      } else {
        console.log('No sessions found matching the criteria.');
      }
      return;
    }
    
    // For JSON output, just print the sessions
    if (options.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }
    
    // Create a table for nicer display
    const table = new Table({
      head: [
        chalk.blue('ID'), 
        chalk.blue('Repository'), 
        chalk.blue('Status'), 
        chalk.blue('Created'), 
        chalk.blue('Command')
      ],
      colWidths: [10, 25, 12, 25, 50]
    });
    
    // Format and add sessions to table
    for (const session of sessions) {
      // Format the date to be more readable
      const createdDate = new Date(session.createdAt);
      const formattedDate = createdDate.toLocaleString();
      
      // Format status with color
      let statusText: string = session.status;
      switch (session.status) {
        case 'running':
          statusText = chalk.green('running');
          break;
        case 'completed':
          statusText = chalk.blue('completed');
          break;
        case 'failed':
          statusText = chalk.red('failed');
          break;
        case 'stopped':
          statusText = chalk.yellow('stopped');
          break;
      }
      
      // Truncate command if it's too long
      const maxCommandLength = 47; // Account for "..." 
      const command = session.command.length > maxCommandLength 
        ? `${session.command.substring(0, maxCommandLength)}...` 
        : session.command;
      
      table.push([
        session.id,
        session.repoFullName,
        statusText,
        formattedDate,
        command
      ]);
    }
    
    console.log(table.toString());
    console.log(`\nUse ${chalk.cyan('claude-hub logs <id>')} to view session logs`);
    
  } catch (error) {
    console.error(`Error listing sessions: ${error instanceof Error ? error.message : String(error)}`);
  }
}