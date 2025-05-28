import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import { createLogger } from './utils/logger';
import { StartupMetrics } from './utils/startup-metrics';
import githubRoutes from './routes/github';
import claudeRoutes from './routes/claude';
import type { 
  WebhookRequest, 
  HealthCheckResponse, 
  TestTunnelResponse,
  ErrorResponse
} from './types/express';
import { execSync } from 'child_process';

const app = express();
const PORT = parseInt(process.env['PORT'] || '3003', 10);
const appLogger = createLogger('app');
const startupMetrics = new StartupMetrics();

// Record initial milestones
startupMetrics.recordMilestone('env_loaded', 'Environment variables loaded');
startupMetrics.recordMilestone('express_initialized', 'Express app initialized');

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    appLogger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`
      },
      `${req.method} ${req.url}`
    );
  });

  next();
});

// Middleware
app.use(startupMetrics.metricsMiddleware());

app.use(
  bodyParser.json({
    verify: (req: WebhookRequest, _res, buf) => {
      // Store the raw body buffer for webhook signature verification
      req.rawBody = buf;
    }
  })
);

startupMetrics.recordMilestone('middleware_configured', 'Express middleware configured');

// Routes
app.use('/api/webhooks/github', githubRoutes);
app.use('/api/claude', claudeRoutes);

startupMetrics.recordMilestone('routes_configured', 'API routes configured');

// Health check endpoint
app.get('/health', async (req: WebhookRequest, res: express.Response<HealthCheckResponse>) => {
  const healthCheckStart = Date.now();

  const checks: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    startup: req.startupMetrics,
    docker: {
      available: false,
      error: null,
      checkTime: null
    },
    claudeCodeImage: {
      available: false,
      error: null,
      checkTime: null
    }
  };

  // Check Docker availability
  const dockerCheckStart = Date.now();
  try {
    execSync('docker ps', { stdio: 'ignore' });
    checks.docker.available = true;
  } catch (error) {
    checks.docker.error = (error as Error).message;
  }
  checks.docker.checkTime = Date.now() - dockerCheckStart;

  // Check Claude Code runner image
  const imageCheckStart = Date.now();
  try {
    execSync('docker image inspect claude-code-runner:latest', { stdio: 'ignore' });
    checks.claudeCodeImage.available = true;
  } catch {
    checks.claudeCodeImage.error = 'Image not found';
  }
  checks.claudeCodeImage.checkTime = Date.now() - imageCheckStart;

  // Set overall status
  if (!checks.docker.available || !checks.claudeCodeImage.available) {
    checks.status = 'degraded';
  }

  checks.healthCheckDuration = Date.now() - healthCheckStart;
  res.status(200).json(checks);
});

// Test endpoint for CF tunnel
app.get('/api/test-tunnel', (req, res: express.Response<TestTunnelResponse>) => {
  appLogger.info('Test tunnel endpoint hit');
  res.status(200).json({
    status: 'success',
    message: 'CF tunnel is working!',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    ip: req.ip || (req.connection as any)?.remoteAddress
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response<ErrorResponse>, _next: express.NextFunction) => {
  appLogger.error(
    {
      err: {
        message: err.message,
        stack: err.stack
      },
      method: req.method,
      url: req.url
    },
    'Request error'
  );

  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  startupMetrics.recordMilestone('server_listening', `Server listening on port ${PORT}`);
  const totalStartupTime = startupMetrics.markReady();
  appLogger.info(`Server running on port ${PORT} (startup took ${totalStartupTime}ms)`);
});