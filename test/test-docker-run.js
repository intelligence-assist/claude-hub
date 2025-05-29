const { execSync } = require('child_process');

// Test running the Docker container directly
try {
  const command = `docker run --rm -v ${process.env.HOME}/.aws:/home/node/.aws:ro -e AWS_PROFILE="claude-webhook" -e AWS_REGION="us-east-2" -e CLAUDE_CODE_USE_BEDROCK="1" -e ANTHROPIC_MODEL="us.anthropic.claude-3-7-sonnet-20250219-v1:0" claudecode:latest /bin/bash -c "cat /home/node/.aws/credentials | grep claude-webhook"`;

  console.log('Testing Docker container AWS credentials access...');
  const result = execSync(command, { encoding: 'utf8' });
  console.log('✓ Container can access AWS credentials');
  console.log('Output:', result);
} catch (error) {
  console.error('✗ Container failed to access AWS credentials');
  console.error('Error:', error.message);
  console.error('Stderr:', error.stderr?.toString());
}
