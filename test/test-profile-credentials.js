const awsCredentialProvider = require('../src/utils/awsCredentialProvider');

async function testProfileCredentials() {
  try {
    console.log('Testing AWS profile credential provider...');

    // Temporarily set USE_AWS_PROFILE to test profile loading
    process.env.USE_AWS_PROFILE = 'true';
    process.env.AWS_PROFILE = 'claude-webhook';

    // Clear any cached credentials
    awsCredentialProvider.clearCache();

    // Get credentials
    const credentials = await awsCredentialProvider.getCredentials();

    console.log('✓ Successfully loaded credentials from profile');
    console.log(`  Source: ${awsCredentialProvider.credentialSource}`);
    console.log(`  Access Key: ...${credentials.accessKeyId.slice(-4)}`);
    console.log(`  Region: ${credentials.region}`);

    // Test Docker env vars
    const dockerEnvVars = await awsCredentialProvider.getDockerEnvVars();
    console.log('\n✓ Docker environment variables generated:');
    console.log(`  AWS_ACCESS_KEY_ID: ...${dockerEnvVars.AWS_ACCESS_KEY_ID.slice(-4)}`);
    console.log(`  AWS_REGION: ${dockerEnvVars.AWS_REGION}`);
    console.log(`  AWS_SESSION_TOKEN: ${dockerEnvVars.AWS_SESSION_TOKEN || 'none'}`);
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    throw error;
  }
}

testProfileCredentials();
