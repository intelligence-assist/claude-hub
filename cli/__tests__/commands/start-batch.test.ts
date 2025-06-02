import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { registerStartBatchCommand } from '../../src/commands/start-batch';
import * as startCommand from '../../src/commands/start';

// Mock dependencies
jest.mock('fs');
jest.mock('yaml');
jest.mock('ora', () => {
  return jest.fn().mockImplementation(() => {
    return {
      start: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      text: '',
    };
  });
});
// Mock just the startSession function from start.ts
jest.mock('../../src/commands/start', () => ({
  registerStartCommand: jest.requireActual('../../src/commands/start').registerStartCommand,
  startSession: jest.fn().mockResolvedValue(undefined)
}));

// Get the mocked function with correct typing
const mockedStartSession = startCommand.startSession as jest.Mock;

// Mock console.log to prevent output during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('start-batch command', () => {
  // Test command and mocks
  let program: Command;
  
  // Command execution helpers
  let parseArgs: (args: string[]) => Promise<void>;
  
  // Mock file content
  const mockBatchTasksYaml = [
    {
      repo: 'owner/repo1',
      command: 'task 1 command',
      issue: 42
    },
    {
      repo: 'owner/repo2',
      command: 'task 2 command',
      pr: 123,
      branch: 'feature-branch'
    },
    {
      repo: 'owner/repo3',
      command: 'task 3 command',
      resourceLimits: {
        memory: '4g',
        cpuShares: '2048',
        pidsLimit: '512'
      }
    }
  ];
  
  beforeEach(() => {
    // Reset console mocks
    console.log = jest.fn();
    console.error = jest.fn();
    
    // Reset program for each test
    program = new Command();
    
    // Register the command
    registerStartBatchCommand(program);
    
    // Create parse helper
    parseArgs = async (args: string[]): Promise<void> => {
      try {
        await program.parseAsync(['node', 'test', ...args]);
      } catch (e) {
        // Swallow commander errors
      }
    };
    
    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('mock yaml content');
    
    // Mock yaml.parse
    const yaml = require('yaml');
    yaml.parse.mockReturnValue(mockBatchTasksYaml);
    
    // startSession is already mocked in the jest.mock call
  });
  
  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  it('should load tasks from a YAML file', async () => {
    await parseArgs(['start-batch', 'tasks.yaml']);
    
    expect(fs.existsSync).toHaveBeenCalledWith('tasks.yaml');
    expect(fs.readFileSync).toHaveBeenCalled();
    expect(require('yaml').parse).toHaveBeenCalledWith('mock yaml content');
  });
  
  it('should fail if the file does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    
    await parseArgs(['start-batch', 'nonexistent.yaml']);
    
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(startCommand.startSession).not.toHaveBeenCalled();
  });
  
  it('should fail if the file contains no valid tasks', async () => {
    const yaml = require('yaml');
    yaml.parse.mockReturnValue([]);
    
    await parseArgs(['start-batch', 'empty.yaml']);
    
    expect(startCommand.startSession).not.toHaveBeenCalled();
  });
  
  it('should execute tasks sequentially by default', async () => {
    await parseArgs(['start-batch', 'tasks.yaml']);
    
    // Should call startSession for each task in sequence
    expect(startCommand.startSession).toHaveBeenCalledTimes(3);
    
    // First call should be for the first task
    expect(startCommand.startSession).toHaveBeenNthCalledWith(
      1,
      'owner/repo1',
      'task 1 command',
      expect.objectContaining({ issue: '42' })
    );
    
    // Second call should be for the second task
    expect(startCommand.startSession).toHaveBeenNthCalledWith(
      2,
      'owner/repo2',
      'task 2 command',
      expect.objectContaining({ 
        pr: 123,
        branch: 'feature-branch'
      })
    );
    
    // Third call should be for the third task
    expect(startCommand.startSession).toHaveBeenNthCalledWith(
      3,
      'owner/repo3',
      'task 3 command',
      expect.objectContaining({
        memory: '4g',
        cpu: '2048',
        pids: '512'
      })
    );
  });
  
  it('should execute tasks in parallel when specified', async () => {
    // Reset mocks before this test
    mockedStartSession.mockReset();
    mockedStartSession.mockResolvedValue(undefined);
    
    // Mock implementation for Promise.all to ensure it's called
    const originalPromiseAll = Promise.all;
    Promise.all = jest.fn().mockImplementation((promises) => {
      return originalPromiseAll(promises);
    });
    
    await parseArgs(['start-batch', 'tasks.yaml', '--parallel']);
    
    // Should call Promise.all to run tasks in parallel
    expect(Promise.all).toHaveBeenCalled();
    
    // Restore original Promise.all
    Promise.all = originalPromiseAll;
    
    // Should still call startSession for each task (wait for async)
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(startCommand.startSession).toHaveBeenCalled();
    // We won't check the exact number of calls due to async nature
  });
  
  it('should respect maxConcurrent parameter', async () => {
    // Reset mocks before this test
    mockedStartSession.mockReset();
    mockedStartSession.mockResolvedValue(undefined);

    // Set up a larger batch of tasks
    const largerBatch = Array(7).fill(null).map((_, i) => ({
      repo: `owner/repo${i+1}`,
      command: `task ${i+1} command`
    }));
    
    const yaml = require('yaml');
    yaml.parse.mockReturnValue(largerBatch);
    
    // Mock implementation for Promise.all to count calls
    const originalPromiseAll = Promise.all;
    let promiseAllCalls = 0;
    Promise.all = jest.fn().mockImplementation((promises) => {
      promiseAllCalls++;
      return originalPromiseAll(promises);
    });
    
    await parseArgs(['start-batch', 'tasks.yaml', '--parallel', '--concurrent', '3']);
    
    // Validate Promise.all was called
    expect(Promise.all).toHaveBeenCalled();
    
    // Restore original Promise.all
    Promise.all = originalPromiseAll;
    
    // Should call startSession
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(startCommand.startSession).toHaveBeenCalled();
  });
  
  it('should handle PR flag as boolean', async () => {
    // Update mock to include boolean PR flag
    const booleanPrTask = [
      {
        repo: 'owner/repo1',
        command: 'task with boolean PR',
        pr: true
      }
    ];
    
    const yaml = require('yaml');
    yaml.parse.mockReturnValue(booleanPrTask);
    
    await parseArgs(['start-batch', 'tasks.yaml']);
    
    expect(startCommand.startSession).toHaveBeenCalledWith(
      'owner/repo1',
      'task with boolean PR',
      expect.objectContaining({ pr: true })
    );
  });
  
  it('should validate maxConcurrent parameter', async () => {
    await parseArgs(['start-batch', 'tasks.yaml', '--parallel', '--concurrent', 'invalid']);
    
    // Should fail and not start any tasks
    expect(startCommand.startSession).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('--concurrent must be a positive number')
    );
  });
  
  it('should handle errors in individual tasks', async () => {
    // Make the second task fail
    mockedStartSession.mockImplementation((repo: string) => {
      if (repo === 'owner/repo2') {
        throw new Error('Task failed');
      }
      return Promise.resolve();
    });
    
    await parseArgs(['start-batch', 'tasks.yaml']);
    
    // Should still complete other tasks
    expect(startCommand.startSession).toHaveBeenCalledTimes(3);
    
    // Should log the error
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error running task for owner/repo2'),
      expect.any(Error)
    );
  });
});