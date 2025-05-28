export type OperationType = 'auto-tagging' | 'pr-review' | 'default';

export interface ClaudeCommandOptions {
  repoFullName: string;
  issueNumber: number | null;
  command: string;
  isPullRequest?: boolean;
  branchName?: string | null;
  operationType?: OperationType;
}

export interface ClaudeProcessResult {
  success: boolean;
  response?: string;
  error?: string;
  errorReference?: string;
  timestamp?: string;
}

export interface ClaudeContainerConfig {
  imageName: string;
  containerName: string;
  entrypointScript: string;
  privileged: boolean;
  capabilities: string[];
  resourceLimits: ClaudeResourceLimits;
}

export interface ClaudeResourceLimits {
  memory: string;
  cpuShares: string;
  pidsLimit: string;
}

export interface ClaudeEnvironmentVars {
  REPO_FULL_NAME: string;
  ISSUE_NUMBER: string;
  IS_PULL_REQUEST: string;
  BRANCH_NAME: string;
  OPERATION_TYPE: string;
  COMMAND: string;
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
}

export interface DockerExecutionOptions {
  maxBuffer: number;
  timeout: number;
}

export interface DockerExecutionResult {
  stdout: string;
  stderr: string;
}

// Claude API Response Types
export interface ClaudeAPIResponse {
  claudeResponse: string;
  success: boolean;
  message?: string;
  context?: {
    repo: string;
    issue?: number;
    pr?: number;
    type: string;
    branch?: string;
  };
}

export interface ClaudeErrorResponse {
  success: false;
  error: string;
  errorReference?: string;
  timestamp?: string;
  message?: string;
  context?: {
    repo: string;
    issue?: number;
    pr?: number;
    type: string;
  };
}

// Container Security Configuration
export interface ContainerCapabilities {
  NET_ADMIN: boolean;
  SYS_ADMIN: boolean;
  NET_RAW?: boolean;
  SYS_TIME?: boolean;
  DAC_OVERRIDE?: boolean;
  AUDIT_WRITE?: boolean;
}

export interface ContainerSecurityConfig {
  privileged: boolean;
  requiredCapabilities: string[];
  optionalCapabilities: Record<string, boolean>;
  resourceLimits: ClaudeResourceLimits;
}

// PR Review Types
export interface PRReviewContext {
  prNumber: number;
  commitSha: string;
  repoFullName: string;
  branchName: string;
}

export interface PRReviewResult {
  prNumber: number;
  success: boolean;
  error: string | null;
  skippedReason: string | null;
}

// Auto-tagging Types
export interface AutoTaggingContext {
  issueNumber: number;
  title: string;
  body: string | null;
  repoFullName: string;
}

export interface LabelCategories {
  priority: string[];
  type: string[];
  complexity: string[];
  component: string[];
}

export const DEFAULT_LABEL_CATEGORIES: LabelCategories = {
  priority: ['critical', 'high', 'medium', 'low'],
  type: ['bug', 'feature', 'enhancement', 'documentation', 'question', 'security'],
  complexity: ['trivial', 'simple', 'moderate', 'complex'],
  component: ['api', 'frontend', 'backend', 'database', 'auth', 'webhook', 'docker']
};