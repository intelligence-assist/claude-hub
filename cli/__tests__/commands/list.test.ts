import { Command } from 'commander';
import { registerListCommand } from '../../src/commands/list';
import { SessionManager } from '../../src/utils/sessionManager';
import { DockerUtils } from '../../src/utils/dockerUtils';
import { SessionConfig } from '../../src/types/session';

// Mock dependencies
jest.mock('../../src/utils/sessionManager');
jest.mock('../../src/utils/dockerUtils');
jest.mock('cli-table3', () => {
  return jest.fn().mockImplementation(() => {
    return {
      push: jest.fn(),
      toString: jest.fn().mockReturnValue('mocked-table')
    };
  });
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('List Command', () => {
  let program: Command;
  let mockListSessions: jest.Mock;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup program
    program = new Command();
    
    // Setup SessionManager mock
    mockListSessions = jest.fn();
    (SessionManager as jest.Mock).mockImplementation(() => ({
      listSessions: mockListSessions
    }));
    
    // Register the command
    registerListCommand(program);
  });
  
  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });
  
  const mockSessions: SessionConfig[] = [
    {
      id: 'session1',
      repoFullName: 'user/repo1',
      containerId: 'container1',
      command: 'help me with this code',
      status: 'running',
      createdAt: '2025-06-01T10:00:00Z',
      updatedAt: '2025-06-01T10:05:00Z'
    },
    {
      id: 'session2',
      repoFullName: 'user/repo2',
      containerId: 'container2',
      command: 'explain this function',
      status: 'completed',
      createdAt: '2025-05-31T09:00:00Z',
      updatedAt: '2025-05-31T09:10:00Z'
    }
  ];
  
  it('should list sessions with default options', async () => {
    // Setup mock to return sessions
    mockListSessions.mockResolvedValue(mockSessions);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list']);
    
    // Check if listSessions was called with correct options
    expect(mockListSessions).toHaveBeenCalledWith({
      status: undefined,
      repo: undefined,
      limit: 10
    });
    
    // Verify output
    expect(mockConsoleLog).toHaveBeenCalledWith('mocked-table');
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Use'));
  });
  
  it('should list sessions with status filter', async () => {
    // Setup mock to return filtered sessions
    mockListSessions.mockResolvedValue([mockSessions[0]]);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list', '--status', 'running']);
    
    // Check if listSessions was called with correct options
    expect(mockListSessions).toHaveBeenCalledWith({
      status: 'running',
      repo: undefined,
      limit: 10
    });
  });
  
  it('should list sessions with repo filter', async () => {
    // Setup mock to return filtered sessions
    mockListSessions.mockResolvedValue([mockSessions[0]]);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list', '--repo', 'user/repo1']);
    
    // Check if listSessions was called with correct options
    expect(mockListSessions).toHaveBeenCalledWith({
      status: undefined,
      repo: 'user/repo1',
      limit: 10
    });
  });
  
  it('should list sessions with limit', async () => {
    // Setup mock to return sessions
    mockListSessions.mockResolvedValue([mockSessions[0]]);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list', '--limit', '1']);
    
    // Check if listSessions was called with correct options
    expect(mockListSessions).toHaveBeenCalledWith({
      status: undefined,
      repo: undefined,
      limit: 1
    });
  });
  
  it('should output as JSON when --json flag is used', async () => {
    // Setup mock to return sessions
    mockListSessions.mockResolvedValue(mockSessions);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list', '--json']);
    
    // Verify JSON output
    expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockSessions, null, 2));
  });
  
  it('should show message when no sessions found', async () => {
    // Setup mock to return empty array
    mockListSessions.mockResolvedValue([]);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list']);
    
    // Verify output
    expect(mockConsoleLog).toHaveBeenCalledWith('No sessions found matching the criteria.');
  });
  
  it('should show empty JSON array when no sessions found with --json flag', async () => {
    // Setup mock to return empty array
    mockListSessions.mockResolvedValue([]);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list', '--json']);
    
    // Verify output
    expect(mockConsoleLog).toHaveBeenCalledWith('[]');
  });
  
  it('should reject invalid status values', async () => {
    // Execute the command with invalid status
    await program.parseAsync(['node', 'test', 'list', '--status', 'invalid']);
    
    // Verify error message
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Invalid status'));
    expect(mockListSessions).not.toHaveBeenCalled();
  });
  
  it('should reject invalid limit values', async () => {
    // Execute the command with invalid limit
    await program.parseAsync(['node', 'test', 'list', '--limit', '-1']);
    
    // Verify error message
    expect(mockConsoleError).toHaveBeenCalledWith('Limit must be a positive number');
    expect(mockListSessions).not.toHaveBeenCalled();
  });
  
  it('should handle errors from sessionManager', async () => {
    // Setup mock to throw error
    mockListSessions.mockRejectedValue(new Error('Database error'));
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'list']);
    
    // Verify error message
    expect(mockConsoleError).toHaveBeenCalledWith('Error listing sessions: Database error');
  });
});