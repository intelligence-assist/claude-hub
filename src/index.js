require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('./utils/logger');
const { StartupMetrics } = require('./utils/startup-metrics');
const githubRoutes = require('./routes/github');
const claudeRoutes = require('./routes/claude');

const app = express();
const PORT = process.env.PORT || 3003;
const appLogger = createLogger('app');
const startupMetrics = new StartupMetrics();

// Configure rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // Limit each IP to 120 webhook requests per minute
  message: 'Too many webhook requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Count all requests, not just failed ones
});

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

// Apply general rate limiting to all requests
app.use(generalLimiter);

app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      // Store the raw body buffer for webhook signature verification
      req.rawBody = buf;
    }
  })
);

startupMetrics.recordMilestone('middleware_configured', 'Express middleware configured');

// Routes with specific rate limiting
app.use('/api/webhooks/github', webhookLimiter, githubRoutes);
app.use('/api/claude', claudeRoutes);

startupMetrics.recordMilestone('routes_configured', 'API routes configured');

// Health check endpoint
app.get('/health', async (req, res) => {
  const healthCheckStart = Date.now();

  const checks = {
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
    const { execSync } = require('child_process');
    execSync('docker ps', { stdio: 'ignore' });
    checks.docker.available = true;
  } catch (error) {
    checks.docker.error = error.message;
  }
  checks.docker.checkTime = Date.now() - dockerCheckStart;

  // Check Claude Code runner image
  const imageCheckStart = Date.now();
  try {
    const { execSync } = require('child_process');
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
app.get('/api/test-tunnel', (req, res) => {
  appLogger.info('Test tunnel endpoint hit');
  res.status(200).json({
    status: 'success',
    message: 'CF tunnel is working!',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    ip: req.ip || req.connection.remoteAddress
  });
});

// Error handling middleware
app.use((err, req, res, _next) => {
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
