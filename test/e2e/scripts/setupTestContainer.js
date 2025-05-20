/**
 * Helper script to set up a test container for E2E testing
 * This is used to wrap shell script functionality in a format Jest can use
 */
const { spawn } = require('child_process');
const path = require('path');

/**
 * Runs a shell script with the provided arguments
 * @param {string} scriptPath - Path to the shell script 
 * @param {string[]} args - Arguments to pass to the script
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const scriptAbsPath = path.resolve(__dirname, scriptPath);
    const proc = spawn('bash', [scriptAbsPath, ...args]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode
      });
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Set up a test container for Claude testing
 * @param {object} options - Container setup options
 * @param {boolean} options.useFirewall - Whether to enable firewall
 * @param {boolean} options.privilegedMode - Whether to use privileged mode
 * @returns {Promise<{containerId: string}>}
 */
async function setupTestContainer({ useFirewall = true, privilegedMode = true } = {}) {
  // Determine which script to run based on options
  let scriptPath;
  
  if (useFirewall && privilegedMode) {
    scriptPath = '../../../test/test-full-flow.sh';
  } else if (privilegedMode) {
    scriptPath = '../../../test/test-basic-container.sh';
  } else if (useFirewall) {
    scriptPath = '../../../test/test-claude-no-firewall.sh';
  } else {
    // Fallback to basic container as minimal-claude script was removed
    scriptPath = '../../../test/test-basic-container.sh';
  }
  
  // Run the setup script
  const result = await runScript(scriptPath);
  
  if (result.exitCode !== 0) {
    throw new Error(`Failed to set up test container: ${result.stderr}`);
  }
  
  // Parse container ID from stdout
  const containerId = result.stdout.match(/Container ID: ([a-f0-9]+)/)?.[1];
  
  if (!containerId) {
    throw new Error('Failed to extract container ID from script output');
  }
  
  return { containerId };
}

/**
 * Clean up a test container
 * @param {string} containerId - ID of the container to clean up
 * @returns {Promise<void>}
 */
async function cleanupTestContainer(containerId) {
  await runScript('../../../test/test-container-cleanup.sh', [containerId]);
}

module.exports = {
  setupTestContainer,
  cleanupTestContainer,
  runScript
};