#!/usr/bin/env node

/**
 * Claude Hub CLI
 * A command-line interface for managing autonomous Claude Code sessions
 */

import { Command } from 'commander';
import { registerStartCommand } from './commands/start';
import { registerListCommand } from './commands/list';
import { registerLogsCommand } from './commands/logs';
import { registerContinueCommand } from './commands/continue';
import { registerStopCommand } from './commands/stop';
import dotenv from 'dotenv';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Find package.json to get version
let version = '1.0.0';
try {
  const packageJsonPath = path.join(__dirname, '../../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = packageJson.version;
  }
} catch (error) {
  console.warn('Could not read package.json for version');
}

// Create the CLI program
const program = new Command();

program
  .name('claude-hub')
  .description('CLI to manage autonomous Claude Code sessions')
  .version(version);

// Register commands
registerStartCommand(program);
registerListCommand(program);
registerLogsCommand(program);
registerContinueCommand(program);
registerStopCommand(program);

// Add a help command that displays examples
program
  .command('examples')
  .description('Show usage examples')
  .action(() => {
    console.log(chalk.blue('Claude Hub CLI Examples:'));
    console.log();
    console.log(chalk.yellow('Starting a new session:'));
    console.log(`  claude-hub start myorg/myrepo "Implement feature X"`);
    console.log(`  claude-hub start myrepo "Fix bug in authentication" --pr 42`);
    console.log();
    console.log(chalk.yellow('Managing sessions:'));
    console.log(`  claude-hub list`);
    console.log(`  claude-hub list --status running --repo myrepo`);
    console.log(`  claude-hub logs abc123`);
    console.log(`  claude-hub logs abc123 --follow`);
    console.log(`  claude-hub continue abc123 "Also update the documentation"`);
    console.log(`  claude-hub stop abc123`);
    console.log(`  claude-hub stop all --force`);
  });

// Error on unknown commands
program.showHelpAfterError();
program.showSuggestionAfterError();

// Parse arguments
program.parse();