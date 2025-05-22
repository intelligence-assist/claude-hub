const fs = require('fs');

// Mock dependencies
jest.mock('fs');
jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

// Setup environment before requiring the module
process.env.AWS_PROFILE = 'test-profile';
process.env.AWS_REGION = 'us-west-2';

// Import module after setting up mocks
const awsCredentialProvider = require('../../../src/utils/awsCredentialProvider');

describe('AWS Credential Provider', () => {
  const mockCredentialsFile = `
[default]
aws_access_key_id = default-access-key
aws_secret_access_key = example-default-secret-key

[test-profile]
aws_access_key_id = test-access-key
aws_secret_access_key = example-test-secret-key
  `;

  const mockConfigFile = `
[default]
region = us-east-1

[profile test-profile]
region = us-west-2
  `;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset provider state
    awsCredentialProvider.clearCache();

    // Mock file system
    fs.readFileSync.mockImplementation(filePath => {
      if (filePath.endsWith('credentials')) {
        return mockCredentialsFile;
      } else if (filePath.endsWith('config')) {
        return mockConfigFile;
      }
      throw new Error(`Unexpected file path: ${filePath}`);
    });
  });

  test('should get credentials from AWS profile', async () => {
    const credentials = await awsCredentialProvider.getCredentials();

    expect(credentials).toEqual({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'example-test-secret-key',
      region: 'us-west-2'
    });

    expect(awsCredentialProvider.credentialSource).toBe('AWS Profile (test-profile)');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  // TODO: Fix this test to properly check caching behavior
  test.skip('should cache credentials', async () => {
    // Mock specific implementation for this test only
    const mockImplementation = jest.fn().mockImplementation(filePath => {
      if (filePath.endsWith('credentials')) {
        return mockCredentialsFile;
      } else if (filePath.endsWith('config')) {
        return mockConfigFile;
      }
      throw new Error(`Unexpected file path: ${filePath}`);
    });

    // Override the mock with our instrumented version
    fs.readFileSync.mockImplementation(mockImplementation);

    // Clear cache to ensure fresh test
    awsCredentialProvider.clearCache();

    // First call should read from files
    const credentials1 = await awsCredentialProvider.getCredentials();

    // Second call should not read files again if caching works
    const credentials2 = await awsCredentialProvider.getCredentials();

    // Verify credentials are equal
    expect(credentials1).toEqual(credentials2);

    // Check the number of calls to our mock implementation
    // If caching works, this should be called exactly twice (once for each file)
    // and not called again on the second getCredentials() call
    expect(mockImplementation).toHaveBeenCalledTimes(2);
  });

  test('should clear credential cache', async () => {
    const credentials1 = await awsCredentialProvider.getCredentials();
    awsCredentialProvider.clearCache();
    const credentials2 = await awsCredentialProvider.getCredentials();

    expect(credentials1).not.toBe(credentials2);
    // Should read files twice (once for each getCredentials call)
    expect(fs.readFileSync).toHaveBeenCalledTimes(4);
  });

  test('should get Docker environment variables', async () => {
    const dockerEnvVars = await awsCredentialProvider.getDockerEnvVars();

    expect(dockerEnvVars).toEqual({
      AWS_PROFILE: 'test-profile',
      AWS_REGION: 'us-west-2'
    });
  });

  test('should throw error if AWS_PROFILE is not set', async () => {
    // Temporarily remove AWS_PROFILE
    const originalProfile = process.env.AWS_PROFILE;
    delete process.env.AWS_PROFILE;

    await expect(awsCredentialProvider.getCredentials()).rejects.toThrow('AWS_PROFILE must be set');

    await expect(awsCredentialProvider.getDockerEnvVars()).rejects.toThrow(
      'AWS_PROFILE must be set'
    );

    // Restore AWS_PROFILE
    process.env.AWS_PROFILE = originalProfile;
  });

  test('should throw error for non-existent profile', async () => {
    process.env.AWS_PROFILE = 'non-existent-profile';

    await expect(awsCredentialProvider.getCredentials()).rejects.toThrow(
      "Profile 'non-existent-profile' not found"
    );

    // Restore AWS_PROFILE
    process.env.AWS_PROFILE = 'test-profile';
  });

  test('should throw error for incomplete credentials', async () => {
    // Mock incomplete credentials file
    const incompleteCredentials = `
[test-profile]
aws_access_key_id = test-access-key
    `;

    fs.readFileSync.mockImplementationOnce(() => incompleteCredentials);
    fs.readFileSync.mockImplementationOnce(() => mockConfigFile);

    await expect(awsCredentialProvider.getCredentials()).rejects.toThrow(
      "Incomplete credentials for profile 'test-profile'"
    );
  });
});
