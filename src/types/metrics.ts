// Performance metrics and monitoring types
export interface StartupMilestone {
  name: string;
  timestamp: number;
  description: string;
}

export interface StartupMetrics {
  startTime: number;
  milestones: StartupMilestone[];
  ready: boolean;
  totalStartupTime?: number;
  
  // Methods (when implemented as a class)
  recordMilestone(name: string, description?: string): void;
  markReady(): number;
  metricsMiddleware(): (req: any, res: any, next: any) => void;
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
}

export interface DockerMetrics {
  containerCount: number;
  imageCount: number;
  volumeCount: number;
  networkCount: number;
  systemInfo: {
    kernelVersion: string;
    operatingSystem: string;
    architecture: string;
    totalMemory: number;
    cpus: number;
  };
}

export interface ClaudeExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  containerStartupTime: number;
  operationTypes: Record<string, number>;
}

export interface GitHubAPIMetrics {
  totalRequests: number;
  rateLimitRemaining: number;
  rateLimitResetTime: number;
  requestsByEndpoint: Record<string, number>;
  errorsByType: Record<string, number>;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version?: string;
  environment?: string;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastChecked: string;
  responseTime?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DetailedHealthCheck extends HealthStatus {
  components: ComponentHealth[];
  metrics: PerformanceMetrics;
  dependencies: {
    github: ComponentHealth;
    claude: ComponentHealth;
    docker: ComponentHealth;
    database?: ComponentHealth;
  };
}

// Monitoring and alerting
export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface MetricAlert {
  id: string;
  threshold: AlertThreshold;
  currentValue: number;
  triggered: boolean;
  timestamp: string;
  message: string;
}

export interface MetricsCollector {
  // Core metrics collection
  recordRequest(metrics: RequestMetrics): void;
  recordClaudeExecution(success: boolean, duration: number, operationType: string): void;
  recordGitHubAPICall(endpoint: string, success: boolean, rateLimitRemaining?: number): void;
  
  // Health monitoring
  checkComponentHealth(componentName: string): Promise<ComponentHealth>;
  getOverallHealth(): Promise<DetailedHealthCheck>;
  
  // Metrics retrieval
  getMetrics(): PerformanceMetrics;
  getStartupMetrics(): StartupMetrics;
  
  // Alerting
  checkThresholds(): MetricAlert[];
  addThreshold(threshold: AlertThreshold): void;
  removeThreshold(id: string): void;
}

// Time series data for metrics
export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface TimeSeries {
  metric: string;
  dataPoints: TimeSeriesDataPoint[];
  resolution: 'second' | 'minute' | 'hour' | 'day';
}

export interface MetricsSnapshot {
  timestamp: string;
  performance: PerformanceMetrics;
  claude: ClaudeExecutionMetrics;
  github: GitHubAPIMetrics;
  docker: DockerMetrics;
  timeSeries: TimeSeries[];
}