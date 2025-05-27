const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
// Use home directory for logs to avoid permission issues
const homeDir = process.env.HOME || '/tmp';
const logsDir = path.join(homeDir, '.claude-webhook', 'logs');
// eslint-disable-next-line no-sync
if (!fs.existsSync(logsDir)) {
  // eslint-disable-next-line no-sync
  fs.mkdirSync(logsDir, { recursive: true });
}

// Determine if we should use file transport in production
const isProduction = process.env.NODE_ENV === 'production';
const logFileName = path.join(logsDir, 'app.log');

// Configure different transports based on environment
const transport = isProduction
  ? {
    targets: [
      // File transport for production
      {
        target: 'pino/file',
        options: { destination: logFileName, mkdir: true }
      },
      // Console pretty transport
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: 'SYS:standard'
        },
        level: 'info'
      }
    ]
  }
  : {
    // Just use pretty logs in development
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:standard'
    }
  };

// Configure the logger
const logger = pino({
  transport,
  timestamp: pino.stdTimeFunctions.isoTime,
  // Include the hostname and pid in the log data
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
    env: process.env.NODE_ENV || 'development'
  },
  level: process.env.LOG_LEVEL || 'info',
  // Define custom log levels if needed
  customLevels: {
    http: 35 // Between info (30) and debug (20)
  },
  redact: {
    paths: [
      // HTTP headers that might contain credentials
      'headers.authorization',
      'headers["x-api-key"]',
      'headers["x-auth-token"]',
      'headers["x-github-token"]',
      'headers.bearer',
      '*.headers.authorization',
      '*.headers["x-api-key"]',
      '*.headers["x-auth-token"]',
      '*.headers["x-github-token"]',
      '*.headers.bearer',

      // Generic sensitive field patterns (top-level)
      'password',
      'passwd',
      'pass',
      'token',
      'secret',
      'secretKey',
      'secret_key',
      'apiKey',
      'api_key',
      'credential',
      'credentials',
      'key',
      'private',
      'privateKey',
      'private_key',
      'auth',
      'authentication',

      // Generic sensitive field patterns (nested)
      '*.password',
      '*.passwd',
      '*.pass',
      '*.token',
      '*.secret',
      '*.secretKey',
      '*.secret_key',
      '*.apiKey',
      '*.api_key',
      '*.credential',
      '*.credentials',
      '*.key',
      '*.private',
      '*.privateKey',
      '*.private_key',
      '*.auth',
      '*.authentication',

      // Specific environment variables (top-level)
      'AWS_SECRET_ACCESS_KEY',
      'AWS_ACCESS_KEY_ID',
      'AWS_SESSION_TOKEN',
      'AWS_SECURITY_TOKEN',
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'ANTHROPIC_API_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'WEBHOOK_SECRET',
      'BOT_TOKEN',
      'API_KEY',
      'SECRET_KEY',
      'ACCESS_TOKEN',
      'REFRESH_TOKEN',
      'JWT_SECRET',
      'DATABASE_URL',
      'DB_PASSWORD',
      'REDIS_PASSWORD',

      // Nested in any object (*)
      '*.AWS_SECRET_ACCESS_KEY',
      '*.AWS_ACCESS_KEY_ID',
      '*.AWS_SESSION_TOKEN',
      '*.AWS_SECURITY_TOKEN',
      '*.GITHUB_TOKEN',
      '*.GH_TOKEN',
      '*.ANTHROPIC_API_KEY',
      '*.GITHUB_WEBHOOK_SECRET',
      '*.WEBHOOK_SECRET',
      '*.BOT_TOKEN',
      '*.API_KEY',
      '*.SECRET_KEY',
      '*.ACCESS_TOKEN',
      '*.REFRESH_TOKEN',
      '*.JWT_SECRET',
      '*.DATABASE_URL',
      '*.DB_PASSWORD',
      '*.REDIS_PASSWORD',

      // Docker-related sensitive content
      'dockerCommand',
      '*.dockerCommand',
      'dockerArgs',
      '*.dockerArgs',
      'command',
      '*.command',

      // Environment variable containers
      'envVars.AWS_SECRET_ACCESS_KEY',
      'envVars.AWS_ACCESS_KEY_ID',
      'envVars.AWS_SESSION_TOKEN',
      'envVars.AWS_SECURITY_TOKEN',
      'envVars.GITHUB_TOKEN',
      'envVars.GH_TOKEN',
      'envVars.ANTHROPIC_API_KEY',
      'envVars.GITHUB_WEBHOOK_SECRET',
      'envVars.WEBHOOK_SECRET',
      'envVars.BOT_TOKEN',
      'envVars.API_KEY',
      'envVars.SECRET_KEY',
      'envVars.ACCESS_TOKEN',
      'envVars.REFRESH_TOKEN',
      'envVars.JWT_SECRET',
      'envVars.DATABASE_URL',
      'envVars.DB_PASSWORD',
      'envVars.REDIS_PASSWORD',

      'env.AWS_SECRET_ACCESS_KEY',
      'env.AWS_ACCESS_KEY_ID',
      'env.AWS_SESSION_TOKEN',
      'env.AWS_SECURITY_TOKEN',
      'env.GITHUB_TOKEN',
      'env.GH_TOKEN',
      'env.ANTHROPIC_API_KEY',
      'env.GITHUB_WEBHOOK_SECRET',
      'env.WEBHOOK_SECRET',
      'env.BOT_TOKEN',
      'env.API_KEY',
      'env.SECRET_KEY',
      'env.ACCESS_TOKEN',
      'env.REFRESH_TOKEN',
      'env.JWT_SECRET',
      'env.DATABASE_URL',
      'env.DB_PASSWORD',
      'env.REDIS_PASSWORD',

      // Process environment variables (using bracket notation for nested objects)
      'process["env"]["AWS_SECRET_ACCESS_KEY"]',
      'process["env"]["AWS_ACCESS_KEY_ID"]',
      'process["env"]["AWS_SESSION_TOKEN"]',
      'process["env"]["AWS_SECURITY_TOKEN"]',
      'process["env"]["GITHUB_TOKEN"]',
      'process["env"]["GH_TOKEN"]',
      'process["env"]["ANTHROPIC_API_KEY"]',
      'process["env"]["GITHUB_WEBHOOK_SECRET"]',
      'process["env"]["WEBHOOK_SECRET"]',
      'process["env"]["BOT_TOKEN"]',
      'process["env"]["API_KEY"]',
      'process["env"]["SECRET_KEY"]',
      'process["env"]["ACCESS_TOKEN"]',
      'process["env"]["REFRESH_TOKEN"]',
      'process["env"]["JWT_SECRET"]',
      'process["env"]["DATABASE_URL"]',
      'process["env"]["DB_PASSWORD"]',
      'process["env"]["REDIS_PASSWORD"]',

      // Process environment variables (as top-level bracket notation keys)
      '["process.env.AWS_SECRET_ACCESS_KEY"]',
      '["process.env.AWS_ACCESS_KEY_ID"]',
      '["process.env.AWS_SESSION_TOKEN"]',
      '["process.env.AWS_SECURITY_TOKEN"]',
      '["process.env.GITHUB_TOKEN"]',
      '["process.env.GH_TOKEN"]',
      '["process.env.ANTHROPIC_API_KEY"]',
      '["process.env.GITHUB_WEBHOOK_SECRET"]',
      '["process.env.WEBHOOK_SECRET"]',
      '["process.env.BOT_TOKEN"]',
      '["process.env.API_KEY"]',
      '["process.env.SECRET_KEY"]',
      '["process.env.ACCESS_TOKEN"]',
      '["process.env.REFRESH_TOKEN"]',
      '["process.env.JWT_SECRET"]',
      '["process.env.DATABASE_URL"]',
      '["process.env.DB_PASSWORD"]',
      '["process.env.REDIS_PASSWORD"]',

      // Output streams that might contain leaked credentials
      'stderr',
      '*.stderr',
      'stdout',
      '*.stdout',
      'output',
      '*.output',
      'logs',
      '*.logs',
      'message',
      '*.message',
      'data',
      '*.data',

      // Error objects that might contain sensitive information
      'error.dockerCommand',
      'error.stderr',
      'error.stdout',
      'error.output',
      'error.message',
      'error.data',
      'err.dockerCommand',
      'err.stderr',
      'err.stdout',
      'err.output',
      'err.message',
      'err.data',

      // HTTP request/response objects
      'request.headers.authorization',
      'response.headers.authorization',
      'req.headers.authorization',
      'res.headers.authorization',
      '*.request.headers.authorization',
      '*.response.headers.authorization',
      '*.req.headers.authorization',
      '*.res.headers.authorization',

      // File paths that might contain credentials
      'credentialsPath',
      '*.credentialsPath',
      'keyPath',
      '*.keyPath',
      'secretPath',
      '*.secretPath',

      // Database connection strings and configurations
      'connectionString',
      '*.connectionString',
      'dbUrl',
      '*.dbUrl',
      'mongoUrl',
      '*.mongoUrl',
      'redisUrl',
      '*.redisUrl',

      // Authentication objects
      'auth.token',
      'auth.secret',
      'auth.key',
      'auth.password',
      '*.auth.token',
      '*.auth.secret',
      '*.auth.key',
      '*.auth.password',
      'authentication.token',
      'authentication.secret',
      'authentication.key',
      'authentication.password',
      '*.authentication.token',
      '*.authentication.secret',
      '*.authentication.key',
      '*.authentication.password',

      // Deep nested patterns (up to 4 levels deep)
      '*.*.password',
      '*.*.secret',
      '*.*.token',
      '*.*.apiKey',
      '*.*.api_key',
      '*.*.credential',
      '*.*.key',
      '*.*.privateKey',
      '*.*.private_key',
      '*.*.AWS_SECRET_ACCESS_KEY',
      '*.*.AWS_ACCESS_KEY_ID',
      '*.*.GITHUB_TOKEN',
      '*.*.ANTHROPIC_API_KEY',
      '*.*.connectionString',
      '*.*.DATABASE_URL',

      '*.*.*.password',
      '*.*.*.secret',
      '*.*.*.token',
      '*.*.*.apiKey',
      '*.*.*.api_key',
      '*.*.*.credential',
      '*.*.*.key',
      '*.*.*.privateKey',
      '*.*.*.private_key',
      '*.*.*.AWS_SECRET_ACCESS_KEY',
      '*.*.*.AWS_ACCESS_KEY_ID',
      '*.*.*.GITHUB_TOKEN',
      '*.*.*.ANTHROPIC_API_KEY',
      '*.*.*.connectionString',
      '*.*.*.DATABASE_URL',

      '*.*.*.*.password',
      '*.*.*.*.secret',
      '*.*.*.*.token',
      '*.*.*.*.apiKey',
      '*.*.*.*.api_key',
      '*.*.*.*.credential',
      '*.*.*.*.key',
      '*.*.*.*.privateKey',
      '*.*.*.*.private_key',
      '*.*.*.*.AWS_SECRET_ACCESS_KEY',
      '*.*.*.*.AWS_ACCESS_KEY_ID',
      '*.*.*.*.GITHUB_TOKEN',
      '*.*.*.*.ANTHROPIC_API_KEY',
      '*.*.*.*.connectionString',
      '*.*.*.*.DATABASE_URL'
    ],
    censor: '[REDACTED]'
  }
});

// Add simple file rotation (will be replaced with pino-roll in production)
if (isProduction) {
  // Check log file size and rotate if necessary
  try {
    const maxSize = 10 * 1024 * 1024; // 10MB
    // eslint-disable-next-line no-sync
    if (fs.existsSync(logFileName)) {
      // eslint-disable-next-line no-sync
      const stats = fs.statSync(logFileName);
      if (stats.size > maxSize) {
        // Simple rotation - keep up to 5 backup files
        for (let i = 4; i >= 0; i--) {
          const oldFile = `${logFileName}.${i}`;
          const newFile = `${logFileName}.${i + 1}`;
          // eslint-disable-next-line no-sync
          if (fs.existsSync(oldFile)) {
            // eslint-disable-next-line no-sync
            fs.renameSync(oldFile, newFile);
          }
        }
        // eslint-disable-next-line no-sync
        fs.renameSync(logFileName, `${logFileName}.0`);

        logger.info('Log file rotated');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error rotating log file');
  }
}

// Log startup message
logger.info(
  {
    app: 'claude-github-webhook',
    startTime: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
    logLevel: logger.level
  },
  'Application starting'
);

// Create a child logger for specific components
const createLogger = component => {
  return logger.child({ component });
};

// Export the logger factory
module.exports = {
  logger,
  createLogger
};
