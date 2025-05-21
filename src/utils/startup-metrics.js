const { createLogger } = require('./logger');

class StartupMetrics {
  constructor() {
    this.logger = createLogger('startup-metrics');
    this.startTime = Date.now();
    this.milestones = {};
    this.isReady = false;
  }

  recordMilestone(name, description = '') {
    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime;
    
    this.milestones[name] = {
      timestamp,
      elapsed,
      description
    };

    this.logger.info({
      milestone: name,
      elapsed: `${elapsed}ms`,
      description
    }, `Startup milestone: ${name}`);

    return elapsed;
  }

  markReady() {
    const totalTime = this.recordMilestone('service_ready', 'Service is ready to accept requests');
    this.isReady = true;
    
    this.logger.info({
      totalStartupTime: `${totalTime}ms`,
      milestones: this.milestones
    }, 'Service startup completed');

    return totalTime;
  }

  getMetrics() {
    return {
      isReady: this.isReady,
      totalElapsed: Date.now() - this.startTime,
      milestones: this.milestones,
      startTime: this.startTime
    };
  }

  // Middleware to add startup metrics to responses
  metricsMiddleware() {
    return (req, res, next) => {
      req.startupMetrics = this.getMetrics();
      next();
    };
  }
}

module.exports = { StartupMetrics };