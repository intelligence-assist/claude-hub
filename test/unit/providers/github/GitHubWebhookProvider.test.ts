import crypto from 'crypto';
import type { Request } from 'express';
import { GitHubWebhookProvider } from '../../../../src/providers/github/GitHubWebhookProvider';
import type {
  GitHubRepository,
  GitHubUser,
  GitHubIssue,
  GitHubPullRequest
} from '../../../../src/types/github';

// Mock the logger
jest.mock('../../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('GitHubWebhookProvider', () => {
  let provider: GitHubWebhookProvider;
  let mockReq: Partial<Request>;

  beforeEach(() => {
    provider = new GitHubWebhookProvider();
    mockReq = {
      headers: {},
      body: {},
      rawBody: ''
    };
  });

  describe('verifySignature', () => {
    it('should verify valid signature', async () => {
      const secret = 'test-secret';
      const payload = '{"test":"data"}';
      const hmac = crypto.createHmac('sha256', secret);
      const signature = 'sha256=' + hmac.update(payload).digest('hex');

      mockReq.headers = { 'x-hub-signature-256': signature };
      mockReq.rawBody = payload;

      const result = await provider.verifySignature(mockReq as Request, secret);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', async () => {
      mockReq.headers = { 'x-hub-signature-256': 'sha256=invalid' };
      mockReq.rawBody = '{"test":"data"}';

      const result = await provider.verifySignature(mockReq as Request, 'test-secret');
      expect(result).toBe(false);
    });

    it('should reject missing signature', async () => {
      mockReq.headers = {};
      mockReq.rawBody = '{"test":"data"}';

      const result = await provider.verifySignature(mockReq as Request, 'test-secret');
      expect(result).toBe(false);
    });

    it('should handle missing rawBody', async () => {
      const secret = 'test-secret';
      const payload = { test: 'data' };
      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', secret);
      const signature = 'sha256=' + hmac.update(payloadString).digest('hex');

      mockReq.headers = { 'x-hub-signature-256': signature };
      mockReq.body = payload;
      mockReq.rawBody = undefined;

      const result = await provider.verifySignature(mockReq as Request, secret);
      expect(result).toBe(true);
    });

    it('should handle signature verification errors', async () => {
      mockReq.headers = { 'x-hub-signature-256': 'invalid-format' };
      mockReq.rawBody = '{"test":"data"}';

      const result = await provider.verifySignature(mockReq as Request, 'test-secret');
      expect(result).toBe(false);
    });
  });

  describe('parsePayload', () => {
    it('should parse GitHub webhook payload', async () => {
      const mockGitHubPayload = {
        action: 'opened',
        repository: { full_name: 'owner/repo' } as GitHubRepository,
        sender: { login: 'user123' } as GitHubUser,
        installation: {
          id: 12345,
          account: { login: 'org' } as GitHubUser
        }
      };

      mockReq.headers = {
        'x-github-event': 'issues',
        'x-github-delivery': 'abc-123'
      };
      mockReq.body = mockGitHubPayload;

      const result = await provider.parsePayload(mockReq as Request);

      expect(result).toMatchObject({
        id: 'abc-123',
        event: 'issues.opened',
        source: 'github',
        githubEvent: 'issues',
        githubDelivery: 'abc-123',
        action: 'opened',
        repository: mockGitHubPayload.repository,
        sender: mockGitHubPayload.sender,
        installation: mockGitHubPayload.installation,
        data: mockGitHubPayload
      });
      expect(result.timestamp).toBeDefined();
    });

    it('should handle missing delivery ID', async () => {
      mockReq.headers = {
        'x-github-event': 'push'
      };
      mockReq.body = {};

      const result = await provider.parsePayload(mockReq as Request);

      expect(result.id).toBeDefined();
      expect(result.id).not.toBe('');
      expect(result.event).toBe('push');
    });

    it('should handle events without action', async () => {
      mockReq.headers = {
        'x-github-event': 'push',
        'x-github-delivery': 'xyz-456'
      };
      mockReq.body = {
        repository: { full_name: 'owner/repo' } as GitHubRepository
      };

      const result = await provider.parsePayload(mockReq as Request);

      expect(result.event).toBe('push');
      expect(result.action).toBeUndefined();
    });
  });

  describe('getEventType', () => {
    it('should return the event type', () => {
      const payload = {
        id: '123',
        timestamp: '2024-01-01T00:00:00Z',
        event: 'issues.opened',
        source: 'github',
        githubEvent: 'issues',
        githubDelivery: 'abc-123',
        data: {}
      };

      const result = provider.getEventType(payload);
      expect(result).toBe('issues.opened');
    });
  });

  describe('getEventDescription', () => {
    it('should generate description with all parts', () => {
      const payload = {
        id: '123',
        timestamp: '2024-01-01T00:00:00Z',
        event: 'issues.opened',
        source: 'github',
        githubEvent: 'issues',
        githubDelivery: 'abc-123',
        action: 'opened',
        repository: { full_name: 'owner/repo' } as GitHubRepository,
        sender: { login: 'user123' } as GitHubUser,
        data: {}
      };

      const result = provider.getEventDescription(payload);
      expect(result).toBe('issues opened in owner/repo by user123');
    });

    it('should handle missing optional parts', () => {
      const payload = {
        id: '123',
        timestamp: '2024-01-01T00:00:00Z',
        event: 'ping',
        source: 'github',
        githubEvent: 'ping',
        githubDelivery: 'abc-123',
        data: {}
      };

      const result = provider.getEventDescription(payload);
      expect(result).toBe('ping');
    });
  });

  describe('transformRepository', () => {
    it('should transform GitHub repository to generic format', () => {
      const githubRepo: GitHubRepository = {
        id: 12345,
        name: 'repo',
        full_name: 'owner/repo',
        owner: { login: 'owner' } as GitHubUser,
        private: false,
        default_branch: 'main'
      } as GitHubRepository;

      const result = GitHubWebhookProvider.transformRepository(githubRepo);

      expect(result).toEqual({
        id: '12345',
        name: 'repo',
        fullName: 'owner/repo',
        owner: 'owner',
        isPrivate: false,
        defaultBranch: 'main'
      });
    });
  });

  describe('transformUser', () => {
    it('should transform GitHub user to generic format', () => {
      const githubUser: GitHubUser = {
        id: 123,
        login: 'user123',
        email: 'user@example.com',
        name: 'User Name'
      } as GitHubUser;

      const result = GitHubWebhookProvider.transformUser(githubUser);

      expect(result).toEqual({
        id: '123',
        username: 'user123',
        email: 'user@example.com',
        displayName: 'User Name'
      });
    });

    it('should use login as displayName when name is missing', () => {
      const githubUser: GitHubUser = {
        id: 123,
        login: 'user123'
      } as GitHubUser;

      const result = GitHubWebhookProvider.transformUser(githubUser);

      expect(result.displayName).toBe('user123');
    });
  });

  describe('transformIssue', () => {
    it('should transform GitHub issue to generic format', () => {
      const githubIssue: GitHubIssue = {
        id: 1,
        number: 42,
        title: 'Test Issue',
        body: 'Issue description',
        state: 'open',
        user: { id: 123, login: 'user123' } as GitHubUser,
        labels: [{ name: 'bug' }, 'enhancement'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      } as GitHubIssue;

      const result = GitHubWebhookProvider.transformIssue(githubIssue);

      expect(result).toEqual({
        id: 1,
        number: 42,
        title: 'Test Issue',
        body: 'Issue description',
        state: 'open',
        author: expect.objectContaining({
          id: '123',
          username: 'user123'
        }),
        labels: ['bug', 'enhancement'],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z')
      });
    });

    it('should handle empty body and labels', () => {
      const githubIssue: GitHubIssue = {
        id: 1,
        number: 42,
        title: 'Test Issue',
        body: null,
        state: 'closed',
        user: { id: 123, login: 'user123' } as GitHubUser,
        labels: undefined,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      } as unknown as GitHubIssue;

      const result = GitHubWebhookProvider.transformIssue(githubIssue);

      expect(result.body).toBe('');
      expect(result.labels).toEqual([]);
    });
  });

  describe('transformPullRequest', () => {
    it('should transform GitHub PR to generic format', () => {
      const githubPR: GitHubPullRequest = {
        id: 1,
        number: 42,
        title: 'Test PR',
        body: 'PR description',
        state: 'open',
        user: { id: 123, login: 'user123' } as GitHubUser,
        labels: [{ name: 'feature' }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        head: { ref: 'feature-branch' },
        base: { ref: 'main' },
        draft: false,
        merged: false,
        merged_at: null
      } as GitHubPullRequest;

      const result = GitHubWebhookProvider.transformPullRequest(githubPR);

      expect(result).toEqual({
        id: 1,
        number: 42,
        title: 'Test PR',
        body: 'PR description',
        state: 'open',
        author: expect.objectContaining({
          id: '123',
          username: 'user123'
        }),
        labels: ['feature'],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        isDraft: false,
        isMerged: false,
        mergedAt: undefined
      });
    });

    it('should handle merged PR', () => {
      const githubPR: GitHubPullRequest = {
        id: 1,
        number: 42,
        title: 'Test PR',
        body: 'PR description',
        state: 'closed',
        user: { id: 123, login: 'user123' } as GitHubUser,
        labels: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        head: { ref: 'feature-branch' },
        base: { ref: 'main' },
        draft: false,
        merged: true,
        merged_at: '2024-01-02T12:00:00Z'
      } as GitHubPullRequest;

      const result = GitHubWebhookProvider.transformPullRequest(githubPR);

      expect(result.isMerged).toBe(true);
      expect(result.mergedAt).toEqual(new Date('2024-01-02T12:00:00Z'));
    });
  });
});
