// Simple focused tests for githubService.js to increase coverage
// This file tests specific functions and edge cases that are missing coverage

// Mock Octokit before requiring modules that use it
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    issues: {
      createComment: jest.fn(),
      addLabels: jest.fn(),
      createLabel: jest.fn(),
      removeLabel: jest.fn()
    },
    pulls: {
      listReviews: jest.fn()
    },
    repos: {
      getCombinedStatusForRef: jest.fn()
    },
    checks: {
      listSuitesForRef: jest.fn()
    }
  }))
}));

// Mock the logger before requiring other modules
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

// Mock secureCredentials before requiring modules that use it
jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn(key => {
    const mockCredentials = {
      GITHUB_TOKEN: 'ghp_test_token_with_proper_prefix',
      ANTHROPIC_API_KEY: 'test_anthropic_key',
      GITHUB_WEBHOOK_SECRET: 'test_secret'
    };
    return mockCredentials[key] || null;
  }),
  has: jest.fn(() => true)
}));

const githubService = require('../../../src/services/githubService');

describe('githubService - Simple Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.BOT_USERNAME = 'TestBot';
  });

  describe('Parameter validation edge cases', () => {
    it('should validate invalid repository owner characters', async () => {
      await expect(
        githubService.postComment({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          issueNumber: 123,
          body: 'Test comment'
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });

    it('should validate invalid repository name characters', async () => {
      await expect(
        githubService.postComment({
          repoOwner: 'testowner',
          repoName: 'invalid@repo',
          issueNumber: 123,
          body: 'Test comment'
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });

    it('should validate negative issue numbers', async () => {
      await expect(
        githubService.postComment({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          issueNumber: -5,
          body: 'Test comment'
        })
      ).rejects.toThrow('Invalid issue number - must be a positive integer');
    });

    it('should validate zero issue numbers', async () => {
      await expect(
        githubService.postComment({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          issueNumber: 0,
          body: 'Test comment'
        })
      ).rejects.toThrow('Invalid issue number - must be a positive integer');
    });

    it('should validate string issue numbers', async () => {
      await expect(
        githubService.postComment({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          issueNumber: 'abc',
          body: 'Test comment'
        })
      ).rejects.toThrow('Invalid issue number - must be a positive integer');
    });
  });

  describe('addLabelsToIssue parameter validation', () => {
    it('should validate repository parameters for addLabelsToIssue', async () => {
      await expect(
        githubService.addLabelsToIssue({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          issueNumber: 123,
          labels: ['type:bug']
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });

    it('should validate issue number for addLabelsToIssue', async () => {
      await expect(
        githubService.addLabelsToIssue({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          issueNumber: -1,
          labels: ['type:bug']
        })
      ).rejects.toThrow('Invalid issue number - must be a positive integer');
    });
  });

  describe('createRepositoryLabels parameter validation', () => {
    it('should validate repository parameters for createRepositoryLabels', async () => {
      await expect(
        githubService.createRepositoryLabels({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          labels: [{ name: 'test', color: 'ff0000', description: 'Test label' }]
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });
  });

  describe('getCombinedStatus parameter validation', () => {
    it('should validate repository parameters for getCombinedStatus', async () => {
      await expect(
        githubService.getCombinedStatus({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          ref: 'main'
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });

    it('should validate ref parameter for getCombinedStatus', async () => {
      await expect(
        githubService.getCombinedStatus({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          ref: 'invalid@ref'
        })
      ).rejects.toThrow('Invalid ref - contains unsafe characters');
    });
  });

  describe('hasReviewedPRAtCommit parameter validation', () => {
    it('should validate repository parameters for hasReviewedPRAtCommit', async () => {
      // Note: hasReviewedPRAtCommit catches validation errors and returns false
      // This is intentional behavior to prevent blocking PR reviews on validation errors
      const result = await githubService.hasReviewedPRAtCommit({
        repoOwner: 'invalid@owner',
        repoName: 'testrepo',
        prNumber: 42,
        commitSha: 'abc123'
      });
      expect(result).toBe(false);
    });
  });

  describe('getCheckSuitesForRef parameter validation', () => {
    it('should validate repository parameters for getCheckSuitesForRef', async () => {
      await expect(
        githubService.getCheckSuitesForRef({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          ref: 'main'
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });

    it('should validate ref parameter for getCheckSuitesForRef', async () => {
      await expect(
        githubService.getCheckSuitesForRef({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          ref: 'invalid@ref'
        })
      ).rejects.toThrow('Invalid ref - contains unsafe characters');
    });
  });

  describe('managePRLabels parameter validation', () => {
    it('should validate repository parameters for managePRLabels', async () => {
      await expect(
        githubService.managePRLabels({
          repoOwner: 'invalid@owner',
          repoName: 'testrepo',
          prNumber: 42,
          labelsToAdd: [],
          labelsToRemove: []
        })
      ).rejects.toThrow('Invalid repository owner or name - contains unsafe characters');
    });
  });

  describe('Test mode behavior', () => {
    it('should return mock data for addLabelsToIssue in test mode', async () => {
      const result = await githubService.addLabelsToIssue({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        issueNumber: 123,
        labels: ['type:bug', 'priority:high']
      });

      expect(result.added_labels).toEqual(['type:bug', 'priority:high']);
      expect(result.timestamp).toBeDefined();
    });

    it('should return mock data for createRepositoryLabels in test mode', async () => {
      const testLabels = [{ name: 'type:bug', color: 'd73a4a', description: 'Bug label' }];

      const result = await githubService.createRepositoryLabels({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        labels: testLabels
      });

      expect(result).toEqual(testLabels);
    });

    it('should return mock data for getCombinedStatus in test mode', async () => {
      const result = await githubService.getCombinedStatus({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        ref: 'main'
      });

      expect(result.state).toBe('success');
      expect(result.total_count).toBe(2);
      expect(result.statuses).toHaveLength(2);
      expect(result.statuses[0].state).toBe('success');
      expect(result.statuses[0].context).toBe('ci/test');
    });

    it('should return false for hasReviewedPRAtCommit in test mode', async () => {
      const result = await githubService.hasReviewedPRAtCommit({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        prNumber: 42,
        commitSha: 'abc123'
      });

      expect(result).toBe(false);
    });

    it('should return mock data for getCheckSuitesForRef in test mode', async () => {
      const result = await githubService.getCheckSuitesForRef({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        ref: 'main'
      });

      expect(result.total_count).toBe(1);
      expect(result.check_suites).toHaveLength(1);
      expect(result.check_suites[0].id).toBe(12345);
      expect(result.check_suites[0].status).toBe('completed');
      expect(result.check_suites[0].conclusion).toBe('success');
    });

    it('should handle managePRLabels in test mode without errors', async () => {
      await expect(
        githubService.managePRLabels({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          prNumber: 42,
          labelsToAdd: ['needs-review'],
          labelsToRemove: ['in-progress']
        })
      ).resolves.toBeUndefined();
    });

    it('should handle managePRLabels with empty label arrays', async () => {
      await expect(
        githubService.managePRLabels({
          repoOwner: 'testowner',
          repoName: 'testrepo',
          prNumber: 42,
          labelsToAdd: [],
          labelsToRemove: []
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getFallbackLabels comprehensive coverage', () => {
    it('should handle security-related keywords', async () => {
      const labels = await githubService.getFallbackLabels(
        'Critical security vulnerability',
        'This is a security issue that needs urgent attention'
      );

      expect(labels).toContain('priority:critical');
      expect(labels).toContain('type:bug');
    });

    it('should handle high priority keywords', async () => {
      const labels = await githubService.getFallbackLabels(
        'Important feature request',
        'This is a high priority item'
      );

      expect(labels).toContain('priority:high');
      expect(labels).toContain('type:feature');
    });

    it('should identify server/backend components', async () => {
      const labels = await githubService.getFallbackLabels(
        'Server performance issue',
        'The backend is running slowly'
      );

      expect(labels).toContain('component:backend');
    });

    it('should identify database components', async () => {
      const labels = await githubService.getFallbackLabels(
        'Database connection issue',
        'The db is not responding correctly'
      );

      expect(labels).toContain('component:database');
    });

    it('should identify authentication components', async () => {
      const labels = await githubService.getFallbackLabels(
        'Login permission problem',
        'Users cannot authenticate properly'
      );

      expect(labels).toContain('component:auth');
    });

    it('should identify webhook components', async () => {
      const labels = await githubService.getFallbackLabels(
        'GitHub webhook issue',
        'The webhook is not firing correctly'
      );

      expect(labels).toContain('component:webhook');
    });

    it('should handle "down" keyword for critical priority', async () => {
      const labels = await githubService.getFallbackLabels(
        'Service is down',
        'The entire system is down'
      );

      expect(labels).toContain('priority:critical');
    });

    it('should handle interface keywords for frontend', async () => {
      const labels = await githubService.getFallbackLabels(
        'Interface improvement needed',
        'The user interface could be better'
      );

      expect(labels).toContain('component:frontend');
      expect(labels).toContain('type:enhancement');
    });

    it('should handle container keywords for docker', async () => {
      const labels = await githubService.getFallbackLabels(
        'Container startup issue',
        "The container won't start properly"
      );

      expect(labels).toContain('component:docker');
    });

    it('should prioritize documentation over other types', async () => {
      const labels = await githubService.getFallbackLabels(
        'Update docs for new bug fix',
        'Documentation needs to be updated to reflect bug fixes'
      );

      expect(labels).toContain('type:documentation');
      // Should not contain type:bug because docs takes precedence
      expect(labels).not.toContain('type:bug');
    });

    it('should handle "problem" keyword for bugs', async () => {
      const labels = await githubService.getFallbackLabels(
        'There is a problem with the system',
        'This problem needs to be resolved'
      );

      expect(labels).toContain('type:bug');
    });

    it('should handle "endpoint" keyword for API', async () => {
      const labels = await githubService.getFallbackLabels(
        'New endpoint needed',
        'We need a new API endpoint for this feature'
      );

      expect(labels).toContain('component:api');
    });
  });
});
