/**
 * Base webhook types for provider-agnostic webhook handling
 */

import type { Response } from 'express';
import type { WebhookRequest } from './express';

/**
 * Base webhook payload that all providers must implement
 */
export interface BaseWebhookPayload {
  id: string;
  timestamp: string;
  event: string;
  source: string;
  data: unknown;
}

/**
 * Context passed to webhook handlers
 */
export interface WebhookContext {
  provider: string;
  authenticated: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Response from webhook handlers
 */
export interface WebhookHandlerResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * Interface for webhook providers (GitHub, GitLab, etc.)
 */
export interface WebhookProvider<T extends BaseWebhookPayload = BaseWebhookPayload> {
  name: string;

  /**
   * Verify the webhook signature/authentication
   */
  verifySignature(req: WebhookRequest, secret: string): Promise<boolean>;

  /**
   * Parse the raw request into a typed payload
   */
  parsePayload(req: WebhookRequest): Promise<T>;

  /**
   * Extract the event type from the payload
   */
  getEventType(payload: T): string;

  /**
   * Get human-readable event description
   */
  getEventDescription(payload: T): string;
}

/**
 * Interface for webhook event handlers
 */
export interface WebhookEventHandler<T extends BaseWebhookPayload = BaseWebhookPayload> {
  /**
   * Event pattern to match (e.g., "issues.opened", "pull_request.*")
   */
  event: string | RegExp;

  /**
   * Priority for handler execution (higher = earlier)
   */
  priority?: number;

  /**
   * Handle the webhook event
   */
  handle(payload: T, context: WebhookContext): Promise<WebhookHandlerResponse>;

  /**
   * Optional validation before handling
   */
  canHandle?(payload: T, context: WebhookContext): boolean;
}

/**
 * Webhook middleware function type
 */
export type WebhookMiddleware = (
  req: WebhookRequest,
  res: Response,
  next: () => void
) => void | Promise<void>;

/**
 * Configuration for webhook providers
 */
export interface WebhookProviderConfig {
  enabled: boolean;
  secret?: string;
  endpoint?: string;
  events?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Registry for webhook providers and handlers
 */
export interface WebhookRegistry {
  /**
   * Register a webhook provider
   */
  registerProvider(provider: WebhookProvider): void;

  /**
   * Register an event handler
   */
  registerHandler(providerName: string, handler: WebhookEventHandler): void;

  /**
   * Get provider by name
   */
  getProvider(name: string): WebhookProvider | undefined;

  /**
   * Get handlers for a provider and event
   */
  getHandlers(providerName: string, event: string): WebhookEventHandler[];
}

/**
 * Generic repository event types (provider-agnostic)
 */
export interface RepositoryInfo {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
}

export interface IssueInfo {
  id: string | number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  author: UserInfo;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRequestInfo extends IssueInfo {
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  isMerged: boolean;
  mergedAt?: Date;
}

export interface CommentInfo {
  id: string;
  body: string;
  author: UserInfo;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Common webhook event payloads
 */
export interface IssueEventPayload extends BaseWebhookPayload {
  action: 'opened' | 'closed' | 'reopened' | 'edited' | 'labeled' | 'unlabeled';
  repository: RepositoryInfo;
  issue: IssueInfo;
  sender: UserInfo;
}

export interface PullRequestEventPayload extends BaseWebhookPayload {
  action:
    | 'opened'
    | 'closed'
    | 'reopened'
    | 'edited'
    | 'merged'
    | 'ready_for_review'
    | 'review_requested';
  repository: RepositoryInfo;
  pullRequest: PullRequestInfo;
  sender: UserInfo;
}

export interface CommentEventPayload extends BaseWebhookPayload {
  action: 'created' | 'edited' | 'deleted';
  repository: RepositoryInfo;
  issue?: IssueInfo;
  pullRequest?: PullRequestInfo;
  comment: CommentInfo;
  sender: UserInfo;
}

/**
 * Check/CI event types
 */
export interface CheckSuiteInfo {
  id: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
  app?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface CheckSuiteEventPayload extends BaseWebhookPayload {
  action: 'requested' | 'rerequested' | 'completed';
  repository: RepositoryInfo;
  checkSuite: CheckSuiteInfo;
  sender: UserInfo;
}
