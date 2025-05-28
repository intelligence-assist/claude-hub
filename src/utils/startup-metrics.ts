import type { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';
import type { StartupMilestone, StartupMetrics as IStartupMetrics } from '../types/metrics';

interface MilestoneData {
  timestamp: number;
  elapsed: number;
  description: string;
}

interface MilestonesMap {
  [name: string]: MilestoneData;
}

export class StartupMetrics implements IStartupMetrics {
  private logger = createLogger('startup-metrics');
  public readonly startTime: number;
  public milestones: StartupMilestone[] = [];
  private milestonesMap: MilestonesMap = {};
  public ready = false;
  public totalStartupTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  recordMilestone(name: string, description = ''): void {
    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime;

    const milestone: StartupMilestone = {
      name,
      timestamp,
      description
    };

    // Store in both array and map for different access patterns
    this.milestones.push(milestone);
    this.milestonesMap[name] = {
      timestamp,
      elapsed,
      description
    };

    this.logger.info(
      {
        milestone: name,
        elapsed: `${elapsed}ms`,
        description
      },
      `Startup milestone: ${name}`
    );
  }

  markReady(): number {
    const timestamp = Date.now();
    const totalTime = timestamp - this.startTime;

    this.recordMilestone('service_ready', 'Service is ready to accept requests');
    this.ready = true;
    this.totalStartupTime = totalTime;

    this.logger.info(
      {
        totalStartupTime: `${totalTime}ms`,
        milestones: this.milestonesMap
      },
      'Service startup completed'
    );

    return totalTime;
  }

  getMetrics(): StartupMetricsResponse {
    return {
      isReady: this.ready,
      totalElapsed: Date.now() - this.startTime,
      milestones: this.milestonesMap,
      startTime: this.startTime,
      totalStartupTime: this.totalStartupTime ?? undefined
    };
  }

  // Middleware to add startup metrics to responses
  metricsMiddleware() {
    return (
      req: Request & { startupMetrics?: StartupMetricsResponse },
      _res: Response,
      next: NextFunction
    ): void => {
      req.startupMetrics = this.getMetrics();
      next();
    };
  }

  // Additional utility methods for TypeScript implementation
  getMilestone(name: string): MilestoneData | undefined {
    return this.milestonesMap[name];
  }

  getMilestoneNames(): string[] {
    return Object.keys(this.milestonesMap);
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  isServiceReady(): boolean {
    return this.ready;
  }

  reset(): void {
    this.milestones = [];
    this.milestonesMap = {};
    this.ready = false;
    delete this.totalStartupTime;
    this.logger.info('Startup metrics reset');
  }
}

// Response interface for metrics
interface StartupMetricsResponse {
  isReady: boolean;
  totalElapsed: number;
  milestones: MilestonesMap;
  startTime: number;
  totalStartupTime?: number;
}
