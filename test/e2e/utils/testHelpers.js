/**
 * Test helper utilities for E2E tests
 */

/**
 * Check if Docker image exists
 * @param {string} imageName - Docker image name
 * @returns {Promise<boolean>}
 */
async function dockerImageExists(imageName) {
  const { spawn } = require('child_process');

  return new Promise(resolve => {
    const child = spawn('docker', ['images', '-q', imageName], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.on('close', code => {
      resolve(code === 0 && stdout.trim().length > 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Check if required environment variables are set
 * @param {Array<string>} requiredVars - Array of required environment variable names
 * @returns {Object} - {missing: Array<string>, hasAll: boolean}
 */
function checkRequiredEnvVars(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  return {
    missing,
    hasAll: missing.length === 0
  };
}

/**
 * Skip test if Docker image doesn't exist
 * @param {string} imageName - Docker image name
 */
async function skipIfDockerImageMissing(imageName) {
  const exists = await dockerImageExists(imageName);
  if (!exists) {
    console.warn(`⚠️ Skipping test: Docker image '${imageName}' not found`);
    return true;
  }
  return false;
}

/**
 * Skip test if required environment variables are missing
 * @param {Array<string>} requiredVars - Array of required environment variable names
 */
function skipIfEnvVarsMissing(requiredVars) {
  const { missing, hasAll } = checkRequiredEnvVars(requiredVars);
  if (!hasAll) {
    console.warn(`⚠️ Skipping test: Missing environment variables: ${missing.join(', ')}`);
    return true;
  }
  return false;
}

/**
 * Create a test suite that can be conditionally skipped
 * @param {string} suiteName - Test suite name
 * @param {Function} suiteFunction - Test suite function
 * @param {Object} options - Options for conditional skipping
 * @param {string} options.dockerImage - Docker image required for tests
 * @param {Array<string>} options.requiredEnvVars - Required environment variables
 */
function conditionalDescribe(suiteName, suiteFunction, options = {}) {
  const { dockerImage, requiredEnvVars = [] } = options;

  describe(suiteName, () => {
    beforeAll(async () => {
      // Check Docker image
      if (dockerImage) {
        const imageExists = await dockerImageExists(dockerImage);
        if (!imageExists) {
          console.warn(`⚠️ Skipping test suite '${suiteName}': Docker image '${dockerImage}' not found`);
          throw new Error(`Docker image '${dockerImage}' not found - skipping tests`);
        }
      }

      // Check environment variables
      if (requiredEnvVars.length > 0) {
        const { missing, hasAll } = checkRequiredEnvVars(requiredEnvVars);
        if (!hasAll) {
          console.warn(`⚠️ Skipping test suite '${suiteName}': Missing environment variables: ${missing.join(', ')}`);
          throw new Error(`Missing environment variables: ${missing.join(', ')} - skipping tests`);
        }
      }
    });

    // Run the actual test suite
    suiteFunction();
  });
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns a boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>}
 */
async function waitFor(condition, timeout = 10000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Assert that stdout contains expected text
 * @param {string} stdout - Standard output to check
 * @param {string|RegExp} expected - Expected text or pattern
 * @param {string} _message - Custom error message
 */
function assertStdoutContains(stdout, expected, _message) {
  if (typeof expected === 'string') {
    expect(stdout).toContain(expected);
  } else if (expected instanceof RegExp) {
    expect(stdout).toMatch(expected);
  } else {
    throw new Error('Expected parameter must be a string or RegExp');
  }
}

/**
 * Assert that a command was successful
 * @param {Object} result - Result from ContainerExecutor.exec()
 * @param {string} expectedOutput - Expected output (optional)
 */
function assertCommandSuccess(result, expectedOutput) {
  expect(result.exitCode).toBe(0);
  if (expectedOutput) {
    assertStdoutContains(result.stdout, expectedOutput);
  }
}

module.exports = {
  dockerImageExists,
  checkRequiredEnvVars,
  skipIfDockerImageMissing,
  skipIfEnvVarsMissing,
  conditionalDescribe,
  waitFor,
  retryWithBackoff,
  assertStdoutContains,
  assertCommandSuccess
};
