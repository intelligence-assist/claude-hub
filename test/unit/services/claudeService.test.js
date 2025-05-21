const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const RepoAnalyzer = require('../../../src/utils/repoAnalyzer');
const { processCommand } = require('../../../src/services/claudeService');

// Mock dependencies
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../../src/utils/sanitize', () => ({
  sanitizeBotMentions: (text) => text // no-op for tests
}));

jest.mock('../../../src/utils/repoAnalyzer');

jest.mock('../../../src/utils/awsCredentialProvider', () => ({
  getCredentials: jest.fn().mockResolvedValue({
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    region: 'us-east-1'
  })
}));

// Reset and configure environment before each test
beforeEach(() => {
  jest.resetAllMocks();
  // Set required environment variables
  process.env.BOT_USERNAME = '@ClaudeBot';
  process.env.GITHUB_TOKEN = 'ghp_test_token';
  process.env.ANTHROPIC_API_KEY = 'test_anthropic_key';
  process.env.REPO_CACHE_DIR = path.join(os.tmpdir(), 'test-repo-cache');
});

describe('Claude Service - Hybrid Mode', () => {
  beforeEach(() => {
    // Default mode to hybrid for tests
    process.env.CONTAINER_MODE = 'hybrid';
    
    // Mock RepoAnalyzer implementation
    RepoAnalyzer.mockImplementation(() => ({
      analyzeRepository: jest.fn().mockResolvedValue({}),
      analysis: {
        repoFullName: 'test-owner/test-repo',
        structure: { src: {}, docs: {} },
        readme: '# Test Repository\n\nThis is a test repository for unit tests.',
        technologies: ['Node.js', 'JavaScript'],
        mainLanguage: 'JavaScript',
        commitStats: {
          totalCommits: 100,
          contributors: 5,
          lastCommitDate: 'Mon May 20 10:00:00 2024'
        }
      },
      generateSummary: jest.fn().mockReturnValue('# Test Repository\n\nThis is a test summary.')
    }));
  });

  test('should use hybrid mode by default', async () => {
    delete process.env.CONTAINER_MODE; // Unset to test default
    
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Explain the codebase',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should have called the RepoAnalyzer
    expect(RepoAnalyzer).toHaveBeenCalled();
    expect(result).toContain('Test Repository');
  });

  test('should use repository analysis in hybrid mode', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'What does this repo do?',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Verify the summary method was called
    expect(RepoAnalyzer.mock.instances[0].generateSummary).toHaveBeenCalled();
    
    // Verify result contains expected content
    expect(result).toContain('Test Repository');
    expect(result).toContain('Response to Your Request');
  });

  test('should handle predefined repositories', async () => {
    // Setup known repositories
    process.env.KNOWN_REPOSITORIES = 'test-owner/known-repo,another-owner/another-repo';
    
    const mockOptions = {
      repoFullName: 'test-owner/known-repo',
      issueNumber: 123,
      command: 'Can you explain this repo?',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Shouldn't call repository analysis for known repos
    expect(RepoAnalyzer.mock.instances[0]?.analyzeRepository).not.toHaveBeenCalled();
    
    // Should contain known repository template
    expect(result).toContain('known repository in our system');
    expect(result).toContain('test-owner/known-repo');
  });

  test('should handle pull request info', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 45,
      command: 'Review this PR',
      isPullRequest: true,
      branchName: 'feature/cool-stuff'
    };
    
    const result = await processCommand(mockOptions);
    
    // Verify branch information is included
    expect(result).toContain('pull request');
    expect(result).toContain('feature/cool-stuff');
  });

  test('should detect explanation requests', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Could you explain how this works?',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should detect this is an explanation request
    expect(result).toContain('explanation request');
  });

  test('should detect implementation requests', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Please implement a new feature that does X',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should detect this is an implementation request
    expect(result).toContain('implement new functionality');
  });
  
  test('should detect bug fix requests', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Can you fix this bug where the app crashes?',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should detect this is a fix request
    expect(result).toContain('issue that needs fixing');
  });

  test('should return test response in test mode', async () => {
    process.env.NODE_ENV = 'test';
    
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should return test mode response
    expect(result).toContain('test environment');
    expect(result).toContain('simulated response');
  });
});

describe('Claude Service - Direct Mode', () => {
  beforeEach(() => {
    process.env.CONTAINER_MODE = 'direct';
    
    // Mock exec to return a response
    const util = require('util');
    util.promisify = jest.fn().mockImplementation((fn) => {
      return jest.fn().mockResolvedValue({
        stdout: 'Direct mode response from Claude',
        stderr: ''
      });
    });
  });

  test('should use direct mode when configured', async () => {
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Analyze this code',
      isPullRequest: false
    };
    
    // Mock Docker image exists
    execSync.mockReturnValue('');
    fs.existsSync.mockReturnValue(true);
    
    const result = await processCommand(mockOptions);
    
    // Should not have called the RepoAnalyzer in direct mode
    expect(RepoAnalyzer).not.toHaveBeenCalled();
    
    // Should have attempted to run docker
    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker inspect'), expect.any(Object));
    
    // Should return the direct mode response
    expect(result).toContain('Direct mode response from Claude');
  });
});

describe('Claude Service - Fallback Behavior', () => {
  beforeEach(() => {
    process.env.CONTAINER_MODE = 'hybrid';
    
    // Mock exec for direct mode fallback
    const util = require('util');
    util.promisify = jest.fn().mockImplementation((fn) => {
      return jest.fn().mockResolvedValue({
        stdout: 'Fallback direct mode response',
        stderr: ''
      });
    });
    
    // Mock Docker image exists
    execSync.mockReturnValue('');
    fs.existsSync.mockReturnValue(true);
  });

  test('should fall back to direct mode when hybrid fails', async () => {
    // Make RepoAnalyzer fail
    RepoAnalyzer.mockImplementation(() => ({
      analyzeRepository: jest.fn().mockRejectedValue(new Error('Analysis failed')),
      analysis: null,
      generateSummary: jest.fn().mockImplementation(() => {
        throw new Error('Cannot generate summary');
      })
    }));
    
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Help me understand this code',
      isPullRequest: false
    };
    
    const result = await processCommand(mockOptions);
    
    // Should have tried to use RepoAnalyzer
    expect(RepoAnalyzer).toHaveBeenCalled();
    
    // Should have fallen back to direct mode
    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker inspect'), expect.any(Object));
    
    // Should return the direct mode response
    expect(result).toContain('Fallback direct mode response');
  });

  test('should not fall back in container-only mode', async () => {
    process.env.CONTAINER_MODE = 'container';
    
    // Make RepoAnalyzer fail
    RepoAnalyzer.mockImplementation(() => ({
      analyzeRepository: jest.fn().mockRejectedValue(new Error('Analysis failed')),
      analysis: null,
      generateSummary: jest.fn().mockImplementation(() => {
        throw new Error('Cannot generate summary');
      })
    }));
    
    const mockOptions = {
      repoFullName: 'test-owner/test-repo',
      issueNumber: 123,
      command: 'Explain the architecture',
      isPullRequest: false
    };
    
    // Should throw an error without fallback
    await expect(processCommand(mockOptions)).rejects.toThrow();
    
    // Should not have tried to use direct mode
    expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('docker run'), expect.any(Object));
  });
});