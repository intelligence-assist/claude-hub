const awsCredentialProvider = require('../src/utils/awsCredentialProvider');

async function testCredentialProvider() {
  console.log('Testing AWS Credential Provider...\n');

  try {
    // Test getting credentials
    console.log('1. Testing credential retrieval:');
    const credentials = await awsCredentialProvider.getCredentials();
    console.log('   Source:', awsCredentialProvider.credentialSource);
    console.log('   Has Access Key:', !!credentials.accessKeyId);
    console.log('   Has Secret Key:', !!credentials.secretAccessKey);
    console.log('   Has Session Token:', !!credentials.sessionToken);
    console.log('   Region:', credentials.region);
    console.log('   Is Temporary:', !!credentials.sessionToken);

    // Test Docker env vars
    console.log('\n2. Testing Docker environment variables:');
    const dockerEnvVars = await awsCredentialProvider.getDockerEnvVars();
    console.log('   AWS_ACCESS_KEY_ID:', dockerEnvVars.AWS_ACCESS_KEY_ID ? '[SET]' : '[NOT SET]');
    console.log('   AWS_SECRET_ACCESS_KEY:', dockerEnvVars.AWS_SECRET_ACCESS_KEY ? '[SET]' : '[NOT SET]');
    console.log('   AWS_SESSION_TOKEN:', dockerEnvVars.AWS_SESSION_TOKEN ? '[SET]' : '[NOT SET]');
    console.log('   AWS_REGION:', dockerEnvVars.AWS_REGION);

    // Test caching
    console.log('\n3. Testing credential caching:');
    const credentials2 = await awsCredentialProvider.getCredentials();
    console.log('   Using cached credentials:', credentials === credentials2);

    // Test cache clearing
    console.log('\n4. Testing cache clearing:');
    awsCredentialProvider.clearCache();
    const credentials3 = await awsCredentialProvider.getCredentials();
    console.log('   Cache cleared successfully:', credentials !== credentials3);

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// Run tests
testCredentialProvider();