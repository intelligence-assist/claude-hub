const fs = require('fs');
const fsPromises = require('fs/promises');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn()
}));
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
const awsCredentialProvider = require('../../../src/utils/awsCredentialProvider').default;

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
    const mockFileRead = filePath => {
      if (filePath.endsWith('credentials')) {
        return Promise.resolve(mockCredentialsFile);
      } else if (filePath.endsWith('config')) {
        return Promise.resolve(mockConfigFile);
      }
      throw new Error(`Unexpected file path: ${filePath}`);
    };

    fs.promises.readFile.mockImplementation(mockFileRead);
    fsPromises.readFile.mockImplementation(mockFileRead);
  });

  test('should get credentials from AWS profile', async () => {
    const result = await awsCredentialProvider.getCredentials();

    expect(result.credentials).toEqual({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'example-test-secret-key',
      region: 'us-west-2'
    });

    expect(result.source).toEqual({
      type: 'profile',
      profileName: 'test-profile',
      isDefault: false
    });

    expect(awsCredentialProvider.getCredentialSource()).toBe('AWS Profile (test-profile)');
    expect(fsPromises.readFile).toHaveBeenCalledTimes(2);
  });

  test('should cache credentials', async () => {
    // First clear any existing cache
    awsCredentialProvider.clearCache();

    // Reset mock counters
    fsPromises.readFile.mockClear();

    // First call should read from files
    const result1 = await awsCredentialProvider.getCredentials();

    // Count how many times readFile was called on first request
    const firstCallCount = fsPromises.readFile.mock.calls.length;

    // Should be exactly 2 calls (credentials and config files)
    expect(firstCallCount).toBe(2);

    // Reset counter to clearly see calls for second request
    fsPromises.readFile.mockClear();

    // Second call should use cached credentials and not read files again
    const result2 = await awsCredentialProvider.getCredentials();

    // Verify credentials are the same object (cached)
    expect(result1.credentials).toEqual(result2.credentials);

    // Verify no additional file reads occurred on second call
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  test('should clear credential cache', async () => {
    const result1 = await awsCredentialProvider.getCredentials();
    awsCredentialProvider.clearCache();
    const result2 = await awsCredentialProvider.getCredentials();

    expect(result1.credentials).not.toBe(result2.credentials);
    // Should read files twice (once for each getCredentials call)
    expect(fsPromises.readFile).toHaveBeenCalledTimes(4);
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

    await expect(awsCredentialProvider.getCredentials()).rejects.toThrow(
      'AWS_PROFILE must be set. Direct credential passing is not supported.'
    );

    expect(() => awsCredentialProvider.getDockerEnvVars()).toThrow(
      'AWS_PROFILE must be set. Direct credential passing is not supported.'
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

    fsPromises.readFile.mockImplementationOnce(() => Promise.resolve(incompleteCredentials));
    fsPromises.readFile.mockImplementationOnce(() => Promise.resolve(mockConfigFile));

    await expect(awsCredentialProvider.getCredentials()).rejects.toThrow(
      "Incomplete credentials for profile 'test-profile'"
    );
  });
});
