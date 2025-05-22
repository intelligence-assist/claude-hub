const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
// Use home directory for logs to avoid permission issues
const homeDir = process.env.HOME || '/tmp';
const logsDir = path.join(homeDir, '.claude-webhook', 'logs');
if (!fs.existsSync(logsDir)) {
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
      'headers.authorization',
      '*.password',
      '*.token',
      '*.secret',
      '*.secretKey',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_ACCESS_KEY_ID',
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'ANTHROPIC_API_KEY',
      '*.AWS_SECRET_ACCESS_KEY',
      '*.AWS_ACCESS_KEY_ID',
      '*.GITHUB_TOKEN',
      '*.GH_TOKEN',
      '*.ANTHROPIC_API_KEY',
      'dockerCommand',
      '*.dockerCommand',
      'envVars.AWS_SECRET_ACCESS_KEY',
      'envVars.AWS_ACCESS_KEY_ID',
      'envVars.GITHUB_TOKEN',
      'envVars.GH_TOKEN',
      'envVars.ANTHROPIC_API_KEY',
      'env.AWS_SECRET_ACCESS_KEY',
      'env.AWS_ACCESS_KEY_ID',
      'env.GITHUB_TOKEN',
      'env.GH_TOKEN',
      'env.ANTHROPIC_API_KEY',
      'stderr',
      '*.stderr',
      'stdout',
      '*.stdout',
      'error.dockerCommand',
      'error.stderr',
      'error.stdout',
      'process.env.GITHUB_TOKEN',
      'process.env.GH_TOKEN',
      'process.env.ANTHROPIC_API_KEY',
      'process.env.AWS_SECRET_ACCESS_KEY',
      'process.env.AWS_ACCESS_KEY_ID'
    ],
    censor: '[REDACTED]'
  }
});

// Add simple file rotation (will be replaced with pino-roll in production)
if (isProduction) {
  // Check log file size and rotate if necessary
  try {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fs.existsSync(logFileName)) {
      const stats = fs.statSync(logFileName);
      if (stats.size > maxSize) {
        // Simple rotation - keep up to 5 backup files
        for (let i = 4; i >= 0; i--) {
          const oldFile = `${logFileName}.${i}`;
          const newFile = `${logFileName}.${i + 1}`;
          if (fs.existsSync(oldFile)) {
            fs.renameSync(oldFile, newFile);
          }
        }
        fs.renameSync(logFileName, `${logFileName}.0`);

        logger.info('Log file rotated');
      }
    }
  } catch (error) {
    console.error('Error rotating log file:', error);
  }
}

// Log startup message
logger.info({
  app: 'claude-github-webhook',
  startTime: new Date().toISOString(),
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development',
  logLevel: logger.level
}, 'Application starting');

// Create a child logger for specific components
const createLogger = (component) => {
  return logger.child({ component });
};

// Export the logger factory
module.exports = {
  logger,
  createLogger
};