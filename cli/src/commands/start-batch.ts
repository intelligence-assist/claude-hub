import { Command } from 'commander';
import { BatchTaskDefinition, BatchOptions } from '../types/session';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import chalk from 'chalk';
import ora from 'ora';

export function registerStartBatchCommand(program: Command): void {
  program
    .command('start-batch')
    .description('Start multiple autonomous Claude Code sessions from a task file')
    .argument('<file>', 'YAML file containing batch task definitions')
    .option('-p, --parallel', 'Run tasks in parallel', false)
    .option('-c, --concurrent <number>', 'Maximum number of concurrent tasks (default: 2)', '2')
    .action(async (file, options) => {
      await startBatch(file, options);
    });
}

async function startBatch(
  file: string,
  options: {
    parallel?: boolean;
    concurrent?: string;
  }
): Promise<void> {
  const spinner = ora('Loading batch tasks...').start();

  try {
    // Check if file exists
    if (!fs.existsSync(file)) {
      spinner.fail(`Task file not found: ${file}`);
      return;
    }

    // Load and parse YAML file
    const filePath = path.resolve(file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const tasks = yaml.parse(fileContent) as BatchTaskDefinition[];

    if (!Array.isArray(tasks) || tasks.length === 0) {
      spinner.fail('No valid tasks found in the task file.');
      return;
    }

    spinner.succeed(`Loaded ${tasks.length} tasks from ${path.basename(file)}`);

    const batchOptions: BatchOptions = {
      tasksFile: filePath,
      parallel: options.parallel,
      maxConcurrent: options.concurrent ? parseInt(options.concurrent, 10) : 2
    };

    // Validate maxConcurrent
    if (isNaN(batchOptions.maxConcurrent!) || batchOptions.maxConcurrent! < 1) {
      console.error('Error: --concurrent must be a positive number');
      return;
    }

    // Run the batch
    if (batchOptions.parallel) {
      console.log(`Running ${tasks.length} tasks in parallel (max ${batchOptions.maxConcurrent} concurrent)...`);
      await runTasksInParallel(tasks, batchOptions.maxConcurrent!);
    } else {
      console.log(`Running ${tasks.length} tasks sequentially...`);
      await runTasksSequentially(tasks);
    }

    console.log(chalk.green('✓ Batch execution completed.'));
  } catch (error) {
    spinner.fail(`Failed to start batch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runTasksSequentially(tasks: BatchTaskDefinition[]): Promise<void> {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\n[${i + 1}/${tasks.length}] Starting task for ${task.repo}: "${task.command.substring(0, 50)}${task.command.length > 50 ? '...' : ''}"`);
    
    // Run the individual task (using start command)
    await runTask(task);
  }
}

async function runTasksInParallel(tasks: BatchTaskDefinition[], maxConcurrent: number): Promise<void> {
  // Split tasks into chunks of maxConcurrent
  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    const chunk = tasks.slice(i, i + maxConcurrent);
    
    console.log(`\nStarting batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(tasks.length / maxConcurrent)} (${chunk.length} tasks)...`);
    
    // Run all tasks in this chunk concurrently
    await Promise.all(chunk.map((task, idx) => {
      console.log(`[${i + idx + 1}/${tasks.length}] Starting task for ${task.repo}: "${task.command.substring(0, 30)}${task.command.length > 30 ? '...' : ''}"`);
      return runTask(task);
    }));
  }
}

async function runTask(task: BatchTaskDefinition): Promise<void> {
  try {
    // Prepare args for the start command
    const args = ['start', task.repo, task.command];
    
    // Add issue context if specified
    if (task.issue) {
      args.push('--issue', String(task.issue));
    }
    
    // Add PR context if specified
    if (task.pr !== undefined) {
      if (typeof task.pr === 'boolean') {
        if (task.pr) args.push('--pr');
      } else {
        args.push('--pr', String(task.pr));
      }
    }
    
    // Add branch if specified
    if (task.branch) {
      args.push('--branch', task.branch);
    }
    
    // Add resource limits if specified
    if (task.resourceLimits) {
      if (task.resourceLimits.memory) {
        args.push('--memory', task.resourceLimits.memory);
      }
      if (task.resourceLimits.cpuShares) {
        args.push('--cpu', task.resourceLimits.cpuShares);
      }
      if (task.resourceLimits.pidsLimit) {
        args.push('--pids', task.resourceLimits.pidsLimit);
      }
    }

    // Import the start command function directly
    const { startSession } = await import('./start');
    
    // Extract command and options from the args
    const repo = task.repo;
    const command = task.command;
    const options: any = {};
    
    if (task.issue) options.issue = String(task.issue);
    if (task.pr !== undefined) options.pr = task.pr;
    if (task.branch) options.branch = task.branch;
    
    if (task.resourceLimits) {
      if (task.resourceLimits.memory) options.memory = task.resourceLimits.memory;
      if (task.resourceLimits.cpuShares) options.cpu = task.resourceLimits.cpuShares;
      if (task.resourceLimits.pidsLimit) options.pids = task.resourceLimits.pidsLimit;
    }

    // Run the start command
    await startSession(repo, command, options);
    
  } catch (error) {
    console.error(`Error running task for ${task.repo}:`, error);
  }
}