const { execSync } = require('child_process');

// Simple test script for Docker container execution
const containerName = `claude-test-${Date.now()}`;

console.log('Running test container...');
try {
  // Execute a simple echo command in the container
  const dockerCommand = `docker run --rm --name ${containerName} claudecode:latest "echo 'This is a test from container'"`;

  console.log('Docker command:', dockerCommand);

  const result = execSync(dockerCommand);

  console.log('Container output:');
  console.log(result.toString());

  console.log('Test completed successfully!');
} catch (error) {
  console.error('Error running container:', error.message);
  if (error.stdout) console.log('stdout:', error.stdout.toString());
  if (error.stderr) console.log('stderr:', error.stderr.toString());

  // Try to clean up the container
  try {
    execSync(`docker rm ${containerName}`);
  } catch {
    // Ignore cleanup errors
  }
}
