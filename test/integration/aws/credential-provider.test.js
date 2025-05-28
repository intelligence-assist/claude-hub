/**
 * Integration test for AWS credential provider and secure credentials integration
 * 
 * This test verifies the interaction between awsCredentialProvider and secureCredentials
 * utilities to ensure proper credential handling, caching, and fallbacks.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { jest: jestGlobal } = require('@jest/globals');

const awsCredentialProvider = require('../../../src/utils/awsCredentialProvider').default;
const secureCredentials = require('../../../src/utils/secureCredentials');
const { logger } = require('../../../src/utils/logger');

describe('AWS Credential Provider Integration', () => {
  let originalHomedir;
  let tempDir;
  let credentialsPath;
  let configPath;
  let originalEnv;
  
  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalHomedir = os.homedir;
    
    // Silence logger during tests
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });
  
  beforeEach(async () => {
    // Create temporary AWS credentials directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-cred-test-'));
    
    // Create temporary .aws directory structure
    const awsDir = path.join(tempDir, '.aws');
    fs.mkdirSync(awsDir, { recursive: true });
    
    // Set paths
    credentialsPath = path.join(awsDir, 'credentials');
    configPath = path.join(awsDir, 'config');
    
    // Mock home directory to use our temporary directory
    os.homedir = jest.fn().mockReturnValue(tempDir);
    
    // Reset credential provider
    awsCredentialProvider.clearCache();
    
    // Start with clean environment for each test
    process.env = { NODE_ENV: 'test' };
  });
  
  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // Restore environment variables
    process.env = { ...originalEnv };
    
    // Clear any mocks
    jest.restoreAllMocks();
  });
  
  afterAll(() => {
    // Restore original homedir function
    os.homedir = originalHomedir;
  });
  
  test('should retrieve credentials from AWS profile', async () => {
    // Create credentials file
    const credentialsContent = `
[test-profile]
aws_access_key_id = AKIATEST0000000FAKE
aws_secret_access_key = testsecreteKy000000000000000000000000FAKE
    `;
    
    // Create config file
    const configContent = `
[profile test-profile]
region = us-west-2
    `;
    
    // Write test files
    fs.writeFileSync(credentialsPath, credentialsContent);
    fs.writeFileSync(configPath, configContent);
    
    // Set environment variable
    process.env.AWS_PROFILE = 'test-profile';
    
    // Test credential retrieval
    const result = await awsCredentialProvider.getCredentials();
    
    // Verify results
    expect(result.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    expect(result.credentials.secretAccessKey).toBe('testsecreteKy000000000000000000000000FAKE');
    expect(result.region).toBe('us-west-2');
    expect(result.source.type).toBe('profile');
    expect(result.source.profileName).toBe('test-profile');
    
    // Verify caching
    expect(awsCredentialProvider.hasCachedCredentials()).toBe(true);
    
    // Get cached credentials
    const cachedResult = await awsCredentialProvider.getCredentials();
    expect(cachedResult.credentials).toEqual(result.credentials);
  });
  
  test('should fall back to environment variables when profile not found', async () => {
    // Set environment variables
    process.env.AWS_ACCESS_KEY_ID = 'AKIATEST0000000FAKE';
    process.env.AWS_SECRET_ACCESS_KEY = 'testsecreteKy000000000000000000000000FAKE';
    process.env.AWS_REGION = 'us-east-1';
    
    // Set non-existent profile
    process.env.AWS_PROFILE = 'non-existent-profile';
    
    // Mock secureCredentials to mimic environment-based retrieval
    jest.spyOn(secureCredentials, 'get').mockImplementation(key => {
      if (key === 'AWS_ACCESS_KEY_ID') return 'AKIATEST0000000FAKE';
      if (key === 'AWS_SECRET_ACCESS_KEY') return 'testsecreteKy000000000000000000000000FAKE';
      if (key === 'AWS_REGION') return 'us-east-1';
      return null;
    });
    
    // Test credential retrieval with fallback
    const result = await awsCredentialProvider.getCredentials();
    
    // Verify results
    expect(result.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    expect(result.credentials.secretAccessKey).toBe('testsecreteKy000000000000000000000000FAKE');
    expect(result.region).toBe('us-east-1');
    expect(result.source.type).toBe('environment');
  });
  
  test('should retrieve credentials from secure credentials store', async () => {
    // Mock secureCredentials
    jest.spyOn(secureCredentials, 'get').mockImplementation(key => {
      if (key === 'AWS_ACCESS_KEY_ID') return 'AKIATEST0000000FAKE';
      if (key === 'AWS_SECRET_ACCESS_KEY') return 'testsecreteKy000000000000000000000000FAKE';
      if (key === 'AWS_REGION') return 'eu-west-1';
      return null;
    });
    
    // Test credential retrieval
    const result = await awsCredentialProvider.getCredentials();
    
    // Verify results
    expect(result.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    expect(result.credentials.secretAccessKey).toBe('testsecreteKy000000000000000000000000FAKE');
    expect(result.region).toBe('eu-west-1');
    expect(result.source.type).toBe('environment');
  });
  
  test('should refresh credentials when explicitly requested', async () => {
    // Create credentials file
    const credentialsContent = `
[test-profile]
aws_access_key_id = AKIATEST0000000FAKE
aws_secret_access_key = testsecreteKy000000000000000000000000FAKE
    `;
    
    // Write credentials file
    fs.writeFileSync(credentialsPath, credentialsContent);
    
    // Set environment variable
    process.env.AWS_PROFILE = 'test-profile';
    
    // Get initial credentials
    const initialResult = await awsCredentialProvider.getCredentials();
    expect(initialResult.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    
    // Modify credentials file
    const updatedCredentialsContent = `
[test-profile]
aws_access_key_id = AKIATEST0000000NEW
aws_secret_access_key = testsecreteKy000000000000000000000000NEW
    `;
    
    // Write updated credentials
    fs.writeFileSync(credentialsPath, updatedCredentialsContent);
    
    // Get cached credentials (should be unchanged)
    const cachedResult = await awsCredentialProvider.getCredentials();
    expect(cachedResult.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    
    // Clear cache
    awsCredentialProvider.clearCache();
    
    // Get fresh credentials
    const refreshedResult = await awsCredentialProvider.getCredentials();
    expect(refreshedResult.credentials.accessKeyId).toBe('AKIATEST0000000NEW');
  });
  
  test('should handle Docker environment credentials', async () => {
    // Mock Docker environment detection
    process.env.CONTAINER_ID = 'mock-container-id';
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = '/credentials/path';
    
    // Skip actual HTTP request to metadata service
    jest.spyOn(awsCredentialProvider, '_getContainerCredentials')
      .mockResolvedValue({
        AccessKeyId: 'AKIATEST0000000FAKE',
        SecretAccessKey: 'testsecreteKy000000000000000000000000FAKE',
        Token: 'docker-token-123',
        Expiration: new Date(Date.now() + 3600000).toISOString()
      });
    
    // Test credential retrieval
    const result = await awsCredentialProvider.getCredentials();
    
    // Verify results
    expect(result.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    expect(result.credentials.secretAccessKey).toBe('testsecreteKy000000000000000000000000FAKE');
    expect(result.credentials.sessionToken).toBe('docker-token-123');
    expect(result.source.type).toBe('container');
  });
  
  test('should integrate with secureCredentials when retrieving AWS profile', async () => {
    // Create credentials file
    const credentialsContent = `
[secure-profile]
aws_access_key_id = AKIATEST0000000FAKE
aws_secret_access_key = testsecreteKy000000000000000000000000FAKE
    `;
    
    // Write credentials file
    fs.writeFileSync(credentialsPath, credentialsContent);
    
    // Mock secureCredentials to return AWS_PROFILE
    jest.spyOn(secureCredentials, 'get').mockImplementation(key => {
      if (key === 'AWS_PROFILE') return 'secure-profile';
      return null;
    });
    
    // Don't set AWS_PROFILE in environment - it should come from secureCredentials
    
    // Test credential retrieval
    const result = await awsCredentialProvider.getCredentials();
    
    // Verify results
    expect(result.credentials.accessKeyId).toBe('AKIATEST0000000FAKE');
    expect(result.credentials.secretAccessKey).toBe('testsecreteKy000000000000000000000000FAKE');
    expect(result.source.type).toBe('profile');
    expect(result.source.profileName).toBe('secure-profile');
  });
});