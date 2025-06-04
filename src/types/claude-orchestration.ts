/**
 * Types for Claude orchestration system
 */

/**
 * Session types for different Claude operations
 */
export type SessionType = 'analysis' | 'implementation' | 'testing' | 'review' | 'coordination';

/**
 * Session status
 */
export type SessionStatus =
  | 'pending'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Orchestration strategy
 */
export interface OrchestrationStrategy {
  parallelSessions?: number;
  phases?: SessionType[];
  dependencyMode?: 'sequential' | 'wait_for_core' | 'parallel';
  timeout?: number; // in milliseconds
}

/**
 * Project information for orchestration
 */
export interface ProjectInfo {
  repository: string;
  branch?: string;
  requirements: string;
  context?: string;
}

/**
 * Base payload for all Claude operations
 */
export interface BaseClaudePayload {
  type: string;
}

/**
 * Claude orchestration request payload
 */
export interface ClaudeOrchestrationPayload extends BaseClaudePayload {
  type:
    | 'orchestrate'
    | 'session'
    | 'coordinate'
    | 'session.create'
    | 'session.get'
    | 'session.list'
    | 'session.start'
    | 'session.output';
  project?: ProjectInfo;
  strategy?: OrchestrationStrategy;
  sessionId?: string;
  parentSessionId?: string;
  dependencies?: string[]; // Session IDs to wait for
  sessionType?: SessionType; // Type of session to create
  autoStart?: boolean; // Whether to start session immediately
  session?: Partial<ClaudeSession>; // For session.create
}

/**
 * Claude orchestration request (webhook format)
 */
export interface ClaudeOrchestrationRequest {
  id: string;
  timestamp: string;
  type: 'orchestrate' | 'session' | 'coordinate';
  project: ProjectInfo;
  strategy?: OrchestrationStrategy;
  sessionId?: string;
  parentSessionId?: string;
  dependencies?: string[]; // Session IDs to wait for
}

/**
 * Individual Claude session
 */
export interface ClaudeSession {
  id: string;
  type: SessionType;
  status: SessionStatus;
  containerId?: string;
  claudeSessionId?: string; // Claude's internal session ID
  project: ProjectInfo;
  dependencies: string[];
  startedAt?: Date;
  completedAt?: Date;
  output?: SessionOutput;
  error?: string;
}

/**
 * Session output
 */
export interface SessionOutput {
  logs: string[];
  artifacts: SessionArtifact[];
  summary: string;
  nextSteps?: string[];
}

/**
 * Session artifact (file, commit, etc.)
 */
export interface SessionArtifact {
  type: 'file' | 'commit' | 'pr' | 'issue' | 'comment';
  path?: string;
  content?: string;
  sha?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Orchestration response
 */
export interface ClaudeOrchestrationResponse {
  orchestrationId: string;
  status: 'initiated' | 'running' | 'completed' | 'failed';
  sessions: ClaudeSession[];
  summary?: string;
  errors?: string[];
}

/**
 * Session management request
 */
export interface SessionManagementRequest {
  action: 'start' | 'stop' | 'status' | 'logs';
  sessionId: string;
}

/**
 * Inter-session communication
 */
export interface SessionCoordinationMessage {
  fromSessionId: string;
  toSessionId: string;
  type: 'dependency_completed' | 'artifact_ready' | 'request_review' | 'custom';
  payload?: unknown;
}
