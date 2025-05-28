// Central export file for all types
export * from './github';
export * from './claude';
export * from './aws';
export * from './express';
export * from './config';
export * from './metrics';

// Common utility types
export interface BaseResponse {
  success: boolean;
  message?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

// Type guards for runtime type checking
export function isWebhookPayload(obj: unknown): obj is import('./github').GitHubWebhookPayload {
  return typeof obj === 'object' && obj !== null && 'repository' in obj && 'sender' in obj;
}

export function isClaudeCommandOptions(obj: unknown): obj is import('./claude').ClaudeCommandOptions {
  return typeof obj === 'object' && obj !== null && 
         'repoFullName' in obj && 'command' in obj;
}

export function isAWSCredentials(obj: unknown): obj is import('./aws').AWSCredentials {
  return typeof obj === 'object' && obj !== null && 
         'accessKeyId' in obj && 'secretAccessKey' in obj;
}

// Common type aliases for convenience
export type WebhookPayload = import('./github').GitHubWebhookPayload;
export type ClaudeOptions = import('./claude').ClaudeCommandOptions;
export type AWSCreds = import('./aws').AWSCredentials;
export type AppConfig = import('./config').ApplicationConfig;
export type Metrics = import('./metrics').PerformanceMetrics;