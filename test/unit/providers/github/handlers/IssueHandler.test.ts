import { IssueHandler } from '../../../../../src/providers/github/handlers/IssueHandler';
import { WebhookProcessor } from '../../../../../src/core/webhook/WebhookProcessor';
import type { IssuesEvent } from '@octokit/webhooks-types';

// Mock dependencies
jest.mock('../../../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  })
}));

jest.mock('../../../../../src/utils/secureCredentials', () => ({
  SecureCredentials: jest.fn().mockImplementation(() => ({
    loadCredentials: jest.fn(),
    getCredential: jest.fn().mockReturnValue('mock-value')
  })),
  secureCredentials: {
    loadCredentials: jest.fn(),
    getCredential: jest.fn().mockReturnValue('mock-value')
  }
}));

jest.mock('../../../../../src/services/claudeService');
jest.mock('../../../../../src/services/githubService');

const claudeService = require('../../../../../src/services/claudeService');
const githubService = require('../../../../../src/services/githubService');

describe('IssueHandler', () => {
  let handler: IssueHandler;
  let processor: WebhookProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new IssueHandler();
    processor = new WebhookProcessor({
      webhookPath: '/test',
      secret: 'test-secret'
    });
  });

  describe('handleIssue', () => {
    const mockEvent: IssuesEvent = {
      action: 'opened',
      issue: {
        id: 123,
        number: 1,
        title: 'Test Issue',
        body: 'This is a test issue about authentication and API integration',
        labels: [],
        state: 'open',
        user: {
          login: 'testuser',
          id: 1
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      repository: {
        id: 456,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        owner: {
          login: 'owner',
          id: 2
        },
        private: false
      },
      sender: {
        login: 'testuser',
        id: 1
      }
    } as any;

    it('should analyze and label new issues', async () => {
      githubService.addLabelsToIssue = jest.fn().mockResolvedValue(undefined);
      claudeService.analyzeIssueForLabels = jest.fn().mockResolvedValue({
        priority: 'medium',
        type: 'feature',
        complexity: 'moderate',
        component: 'api,auth'
      });

      await handler.handleIssue(mockEvent, processor);

      expect(claudeService.analyzeIssueForLabels).toHaveBeenCalledWith(
        'owner/test-repo',
        1,
        'Test Issue',
        'This is a test issue about authentication and API integration'
      );

      expect(githubService.addLabelsToIssue).toHaveBeenCalledWith('owner/test-repo', 1, [
        'priority:medium',
        'type:feature',
        'complexity:moderate',
        'component:api',
        'component:auth'
      ]);
    });

    it('should handle errors gracefully', async () => {
      claudeService.analyzeIssueForLabels = jest
        .fn()
        .mockRejectedValue(new Error('Analysis failed'));

      await expect(handler.handleIssue(mockEvent, processor)).resolves.not.toThrow();
    });

    it('should skip non-opened events', async () => {
      const editEvent = { ...mockEvent, action: 'edited' } as IssuesEvent;

      await handler.handleIssue(editEvent, processor);

      expect(claudeService.analyzeIssueForLabels).not.toHaveBeenCalled();
      expect(githubService.addLabelsToIssue).not.toHaveBeenCalled();
    });

    it('should handle empty label analysis', async () => {
      claudeService.analyzeIssueForLabels = jest.fn().mockResolvedValue({});
      githubService.addLabelsToIssue = jest.fn();

      await handler.handleIssue(mockEvent, processor);

      expect(githubService.addLabelsToIssue).toHaveBeenCalledWith('owner/test-repo', 1, []);
    });
  });
});
