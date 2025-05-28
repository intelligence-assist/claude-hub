// Environment variable configuration types
export interface EnvironmentConfig {
  // Required environment variables
  BOT_USERNAME: string;
  BOT_EMAIL: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;

  // Optional environment variables with defaults
  PORT?: string;
  NODE_ENV?: 'development' | 'production' | 'test';
  DEFAULT_AUTHORIZED_USER?: string;
  AUTHORIZED_USERS?: string;

  // Claude container configuration
  CLAUDE_CONTAINER_IMAGE?: string;
  CLAUDE_CONTAINER_PRIVILEGED?: string;
  CLAUDE_CONTAINER_MEMORY_LIMIT?: string;
  CLAUDE_CONTAINER_CPU_SHARES?: string;
  CLAUDE_CONTAINER_PIDS_LIMIT?: string;
  CONTAINER_LIFETIME_MS?: string;

  // Container capabilities
  CLAUDE_CONTAINER_CAP_NET_RAW?: string;
  CLAUDE_CONTAINER_CAP_SYS_TIME?: string;
  CLAUDE_CONTAINER_CAP_DAC_OVERRIDE?: string;
  CLAUDE_CONTAINER_CAP_AUDIT_WRITE?: string;

  // PR review configuration
  PR_REVIEW_WAIT_FOR_ALL_CHECKS?: string;
  PR_REVIEW_TRIGGER_WORKFLOW?: string;
  PR_REVIEW_DEBOUNCE_MS?: string;
  PR_REVIEW_MAX_WAIT_MS?: string;
  PR_REVIEW_CONDITIONAL_TIMEOUT_MS?: string;

  // Testing and development
  SKIP_WEBHOOK_VERIFICATION?: string;
}

export interface ApplicationConfig {
  // Server configuration
  port: number;
  nodeEnv: 'development' | 'production' | 'test';

  // Bot configuration
  botUsername: string;
  botEmail: string;
  authorizedUsers: string[];

  // GitHub configuration
  githubWebhookSecret: string;
  githubToken: string;
  skipWebhookVerification: boolean;

  // Claude configuration
  anthropicApiKey: string;
  claudeContainerImage: string;
  containerLifetimeMs: number;

  // Container security configuration
  container: {
    privileged: boolean;
    memoryLimit: string;
    cpuShares: string;
    pidsLimit: string;
    capabilities: {
      netRaw: boolean;
      sysTime: boolean;
      dacOverride: boolean;
      auditWrite: boolean;
    };
  };

  // PR review configuration
  prReview: {
    waitForAllChecks: boolean;
    triggerWorkflow?: string;
    debounceMs: number;
    maxWaitMs: number;
    conditionalTimeoutMs: number;
  };
}

// Configuration validation
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RequiredEnvVar {
  name: keyof EnvironmentConfig;
  description: string;
  example?: string;
}

export interface OptionalEnvVar extends RequiredEnvVar {
  defaultValue: string | number | boolean;
}

// Security configuration
export interface SecurityConfig {
  webhookSignatureRequired: boolean;
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    enabled: boolean;
    origins: string[];
  };
  helmet: {
    enabled: boolean;
    options: Record<string, unknown>;
  };
}

// Logging configuration
export interface LoggingConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  format: 'json' | 'pretty';
  redaction: {
    enabled: boolean;
    patterns: string[];
  };
  file: {
    enabled: boolean;
    path?: string;
    maxSize?: string;
    maxFiles?: number;
  };
}

// Performance monitoring configuration
export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    endpoint?: string;
    interval?: number;
  };
  tracing: {
    enabled: boolean;
    sampleRate?: number;
  };
  healthCheck: {
    enabled: boolean;
    interval?: number;
    timeout?: number;
  };
}

// Feature flags
export interface FeatureFlags {
  autoTagging: boolean;
  prReview: boolean;
  containerIsolation: boolean;
  advancedSecurity: boolean;
  metricsCollection: boolean;
}

// Complete application configuration
export interface AppConfiguration {
  app: ApplicationConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
  features: FeatureFlags;
}