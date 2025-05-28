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

// Import types for type guards and aliases
import type { GitHubWebhookPayload } from './github';
import type { ClaudeCommandOptions } from './claude';
import type { AWSCredentials } from './aws';
import type { ApplicationConfig } from './config';
import type { PerformanceMetrics } from './metrics';

// Type guards for runtime type checking
export function isWebhookPayload(obj: unknown): obj is GitHubWebhookPayload {
  return typeof obj === 'object' && obj !== null && 'repository' in obj && 'sender' in obj;
}

export function isClaudeCommandOptions(obj: unknown): obj is ClaudeCommandOptions {
  return typeof obj === 'object' && obj !== null && 'repoFullName' in obj && 'command' in obj;
}

export function isAWSCredentials(obj: unknown): obj is AWSCredentials {
  return (
    typeof obj === 'object' && obj !== null && 'accessKeyId' in obj && 'secretAccessKey' in obj
  );
}

// Common type aliases for convenience
export type WebhookPayload = GitHubWebhookPayload;
export type ClaudeOptions = ClaudeCommandOptions;
export type AWSCreds = AWSCredentials;
export type AppConfig = ApplicationConfig;
export type Metrics = PerformanceMetrics;
