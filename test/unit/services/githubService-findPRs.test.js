// Mock Octokit before requiring modules that use it
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      listPullRequestsAssociatedWithCommit: jest.fn()
    }
  }))
}));

// Mock the logger before requiring other modules
jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));

// Mock secureCredentials to return test tokens
jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn((key) => {
    if (key === 'GITHUB_TOKEN') return 'test-token';
    return null;
  })
}));

// Set required environment variables BEFORE importing modules
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN = 'test-token';

const githubService = require('../../../src/services/githubService');

describe('GitHub Service - findPRsForCommit', () => {
  it('should return mock PR data in test mode', async () => {
    const result = await githubService.findPRsForCommit({
      repoOwner: 'owner',
      repoName: 'repo',
      commitSha: 'abc123def456789012345678901234567890abcd'
    });

    expect(result).toEqual([
      {
        number: 42,
        head: {
          ref: 'feature-branch',
          sha: 'abc123def456789012345678901234567890abcd'
        },
        base: {
          ref: 'main'
        }
      }
    ]);
  });

  it('should validate repository parameters', async () => {
    await expect(
      githubService.findPRsForCommit({
        repoOwner: 'owner/invalid',
        repoName: 'repo',
        commitSha: 'abc123def456789012345678901234567890abcd'
      })
    ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
  });

  it('should validate commit SHA format', async () => {
    await expect(
      githubService.findPRsForCommit({
        repoOwner: 'owner',
        repoName: 'repo',
        commitSha: 'invalid-sha'
      })
    ).rejects.toThrow('Invalid commit SHA format');
  });

  it('should handle short SHA by rejecting it', async () => {
    await expect(
      githubService.findPRsForCommit({
        repoOwner: 'owner',
        repoName: 'repo',
        commitSha: 'abc123'
      })
    ).rejects.toThrow('Invalid commit SHA format');
  });
});