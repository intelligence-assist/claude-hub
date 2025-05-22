const githubService = require('../../../src/services/githubService');

// Mock axios to avoid actual HTTP requests during tests
jest.mock('axios');
const axios = require('axios');

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

describe('githubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure we're in test mode
    process.env.NODE_ENV = 'test';
  });

  describe('getFallbackLabels', () => {
    it('should identify bug labels correctly', async () => {
      const labels = await githubService.getFallbackLabels(
        'Fix critical bug in authentication',
        'There is an error when users try to login'
      );

      expect(labels).toContain('type:bug');
      expect(labels).toContain('priority:critical');
      expect(labels).toContain('component:auth');
    });

    it('should identify feature labels correctly', async () => {
      const labels = await githubService.getFallbackLabels(
        'Add new API endpoint for user profiles',
        'We need to create a new feature for managing user profiles'
      );

      expect(labels).toContain('type:feature');
      expect(labels).toContain('component:api');
    });

    it('should identify enhancement labels correctly', async () => {
      const labels = await githubService.getFallbackLabels(
        'Improve frontend performance',
        'The UI could be better and more responsive'
      );

      expect(labels).toContain('type:enhancement');
      expect(labels).toContain('component:frontend');
    });

    it('should identify question labels correctly', async () => {
      const labels = await githubService.getFallbackLabels(
        'How to setup Docker configuration?',
        'I need help with container setup'
      );

      expect(labels).toContain('type:question');
      expect(labels).toContain('component:docker');
    });

    it('should identify documentation labels correctly', async () => {
      const labels = await githubService.getFallbackLabels(
        'Update README with new installation steps',
        'Documentation needs to be updated'
      );

      expect(labels).toContain('type:documentation');
    });

    it('should default to medium priority when no specific priority keywords found', async () => {
      const labels = await githubService.getFallbackLabels(
        'Add some new feature',
        'This would be nice to have'
      );

      expect(labels).toContain('priority:medium');
    });

    it('should handle empty descriptions gracefully', async () => {
      const labels = await githubService.getFallbackLabels(
        'Bug in authentication',
        null
      );

      expect(labels).toContain('type:bug');
      expect(labels).toContain('component:auth');
    });
  });

  describe('addLabelsToIssue - test mode', () => {
    it('should return mock data in test mode', async () => {
      const result = await githubService.addLabelsToIssue({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        issueNumber: 123,
        labels: ['type:bug', 'priority:high']
      });

      expect(result.added_labels).toEqual(['type:bug', 'priority:high']);
      expect(result.timestamp).toBeDefined();
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('createRepositoryLabels - test mode', () => {
    it('should return labels array in test mode', async () => {
      const testLabels = [
        { name: 'type:bug', color: 'd73a4a', description: 'Bug label' },
        { name: 'priority:high', color: 'd93f0b', description: 'High priority label' }
      ];

      const result = await githubService.createRepositoryLabels({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        labels: testLabels
      });

      expect(result).toEqual(testLabels);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('postComment - test mode', () => {
    it('should return mock comment data in test mode', async () => {
      const result = await githubService.postComment({
        repoOwner: 'testowner',
        repoName: 'testrepo',
        issueNumber: 123,
        body: 'Test comment'
      });

      expect(result.id).toBe('test-comment-id');
      expect(result.body).toBe('Test comment');
      expect(result.created_at).toBeDefined();
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});