import { Request, Response, NextFunction } from 'express';
import { GitHubWebhookPayload } from './github';
import { StartupMetrics } from './metrics';

// Extended Express Request with custom properties
export interface WebhookRequest extends Request {
  rawBody?: Buffer;
  startupMetrics?: StartupMetrics;
  body: GitHubWebhookPayload;
}

export interface ClaudeAPIRequest extends Request {
  body: {
    repoFullName?: string;
    repository?: string;
    issueNumber?: number;
    command: string;
    isPullRequest?: boolean;
    branchName?: string;
    authToken?: string;
    useContainer?: boolean;
  };
}

// Custom response types for our endpoints
export interface WebhookResponse {
  success?: boolean;
  message: string;
  context?: {
    repo: string;
    issue?: number;
    pr?: number;
    type?: string;
    sender?: string;
    branch?: string;
  };
  claudeResponse?: string;
  errorReference?: string;
  timestamp?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  startup?: StartupMetrics;
  docker: {
    available: boolean;
    error: string | null;
    checkTime: number | null;
  };
  claudeCodeImage: {
    available: boolean;
    error: string | null;
    checkTime: number | null;
  };
  healthCheckDuration?: number;
}

export interface TestTunnelResponse {
  status: 'success';
  message: string;
  timestamp: string;
  headers: Record<string, string | string[] | undefined>;
  ip: string | undefined;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  errorReference?: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

// Middleware types
export type WebhookHandler = (
  req: WebhookRequest,
  res: Response<WebhookResponse | ErrorResponse>,
  next: NextFunction
) => Promise<Response<WebhookResponse | ErrorResponse> | void> | Response<WebhookResponse | ErrorResponse> | void;

export type ClaudeAPIHandler = (
  req: ClaudeAPIRequest,
  res: Response,
  next: NextFunction
) => Promise<Response | void> | Response | void;

export type HealthCheckHandler = (
  req: Request,
  res: Response<HealthCheckResponse>,
  next: NextFunction
) => Promise<void> | void;

export type ErrorHandler = (
  err: Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) => void;

// Request logging types
export interface RequestLogData {
  method: string;
  url: string;
  statusCode: number;
  responseTime: string;
}

export interface WebhookHeaders {
  'x-github-event'?: string;
  'x-github-delivery'?: string;
  'x-hub-signature-256'?: string;
  'user-agent'?: string;
  'content-type'?: string;
}

// Express app configuration
export interface AppConfig {
  port: number;
  bodyParserLimit?: string;
  requestTimeout?: number;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
}

// Custom error types for Express handlers
export interface ValidationError extends Error {
  statusCode: 400;
  field?: string;
  value?: unknown;
}

export interface AuthenticationError extends Error {
  statusCode: 401;
  challenge?: string;
}

export interface AuthorizationError extends Error {
  statusCode: 403;
  requiredPermission?: string;
}

export interface NotFoundError extends Error {
  statusCode: 404;
  resource?: string;
}

export interface WebhookVerificationError extends Error {
  statusCode: 401;
  signature?: string;
}

export interface RateLimitError extends Error {
  statusCode: 429;
  retryAfter?: number;
}