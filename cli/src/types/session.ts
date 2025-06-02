/**
 * Types for managing Claude Code sessions
 */

export interface SessionConfig {
  id: string;
  repoFullName: string;
  containerId: string;
  command: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  isPullRequest?: boolean;
  isIssue?: boolean;
  issueNumber?: number;
  prNumber?: number;
  branchName?: string;
  resourceLimits?: ResourceLimits;
}

export type SessionStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface ResourceLimits {
  memory: string;
  cpuShares: string;
  pidsLimit: string;
}

export interface StartSessionOptions {
  repoFullName: string;
  command: string;
  isPullRequest?: boolean;
  isIssue?: boolean;
  issueNumber?: number;
  prNumber?: number;
  branchName?: string;
  resourceLimits?: ResourceLimits;
}

export interface ContinueSessionOptions {
  sessionId: string;
  command: string;
}

export interface SessionListOptions {
  status?: SessionStatus;
  repo?: string;
  limit?: number;
}

export interface SessionLogOptions {
  sessionId: string;
  follow?: boolean;
  tail?: number;
}

export interface StopSessionOptions {
  sessionId: string;
  force?: boolean;
}

export interface BatchTaskDefinition {
  repo: string;
  command: string;
  issue?: number;
  pr?: number | boolean;
  branch?: string;
  resourceLimits?: ResourceLimits;
}

export interface BatchOptions {
  tasksFile: string;
  parallel?: boolean;
  maxConcurrent?: number;
}