import crypto from 'crypto';
import { createLogger } from '../../utils/logger';
import type { WebhookRequest } from '../../types/express';
import type {
  WebhookProvider,
  BaseWebhookPayload,
  RepositoryInfo,
  UserInfo,
  IssueInfo,
  PullRequestInfo
} from '../../types/webhook';
import type {
  GitHubRepository,
  GitHubUser,
  GitHubIssue,
  GitHubPullRequest
} from '../../types/github';

const logger = createLogger('GitHubWebhookProvider');

/**
 * GitHub-specific webhook payload
 */
export interface GitHubWebhookEvent extends BaseWebhookPayload {
  githubEvent: string;
  githubDelivery: string;
  action?: string;
  repository?: GitHubRepository;
  sender?: GitHubUser;
  installation?: {
    id: number;
    account: GitHubUser;
  };
}

/**
 * GitHub webhook provider implementation
 */
export class GitHubWebhookProvider implements WebhookProvider<GitHubWebhookEvent> {
  readonly name = 'github';

  /**
   * Verify GitHub webhook signature
   */
  verifySignature(req: WebhookRequest, secret: string): Promise<boolean> {
    return Promise.resolve(this.verifySignatureSync(req, secret));
  }

  private verifySignatureSync(req: WebhookRequest, secret: string): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      logger.warn('No signature found in GitHub webhook request');
      return false;
    }

    try {
      const payload = req.rawBody ?? JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', secret);
      const calculatedSignature = 'sha256=' + hmac.update(payload).digest('hex');

      // Use timing-safe comparison
      if (
        signature.length === calculatedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature))
      ) {
        logger.debug('GitHub webhook signature verified successfully');
        return true;
      }

      logger.warn('GitHub webhook signature verification failed');
      return false;
    } catch (error) {
      logger.error({ err: error }, 'Error verifying GitHub webhook signature');
      return false;
    }
  }

  /**
   * Parse GitHub webhook payload
   */
  parsePayload(req: WebhookRequest): Promise<GitHubWebhookEvent> {
    return Promise.resolve(this.parsePayloadSync(req));
  }

  private parsePayloadSync(req: WebhookRequest): GitHubWebhookEvent {
    const githubEvent = req.headers['x-github-event'] as string;
    const githubDelivery = req.headers['x-github-delivery'] as string;
    const payload = req.body;

    return {
      id: githubDelivery || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: this.normalizeEventType(githubEvent, payload.action),
      source: 'github',
      githubEvent,
      githubDelivery,
      action: payload.action,
      repository: payload.repository,
      sender: payload.sender,
      installation: payload.installation,
      data: payload
    };
  }

  /**
   * Get normalized event type
   */
  getEventType(payload: GitHubWebhookEvent): string {
    return payload.event;
  }

  /**
   * Get human-readable event description
   */
  getEventDescription(payload: GitHubWebhookEvent): string {
    const parts = [payload.githubEvent];
    if (payload.action) {
      parts.push(payload.action);
    }
    if (payload.repository) {
      parts.push(`in ${payload.repository.full_name}`);
    }
    if (payload.sender) {
      parts.push(`by ${payload.sender.login}`);
    }
    return parts.join(' ');
  }

  /**
   * Normalize GitHub event type to a consistent format
   */
  private normalizeEventType(event: string, action?: string): string {
    if (!action) {
      return event;
    }
    return `${event}.${action}`;
  }

  /**
   * Transform GitHub repository to generic format
   */
  static transformRepository(repo: GitHubRepository): RepositoryInfo {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch
    };
  }

  /**
   * Transform GitHub user to generic format
   */
  static transformUser(user: GitHubUser): UserInfo {
    return {
      id: user.id.toString(),
      username: user.login,
      email: user.email,
      displayName: user.name ?? user.login
    };
  }

  /**
   * Transform GitHub issue to generic format
   */
  static transformIssue(issue: GitHubIssue): IssueInfo {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      author: GitHubWebhookProvider.transformUser(issue.user),
      labels: issue.labels?.map(label => (typeof label === 'string' ? label : label.name)) ?? [],
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at)
    };
  }

  /**
   * Transform GitHub pull request to generic format
   */
  static transformPullRequest(pr: GitHubPullRequest): PullRequestInfo {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      state: pr.state as 'open' | 'closed',
      author: GitHubWebhookProvider.transformUser(pr.user),
      labels: pr.labels?.map(label => (typeof label === 'string' ? label : label.name)) ?? [],
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      isDraft: pr.draft || false,
      isMerged: pr.merged || false,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined
    };
  }
}
