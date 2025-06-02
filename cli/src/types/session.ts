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