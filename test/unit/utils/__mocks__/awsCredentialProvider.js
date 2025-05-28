/**
 * Mock AWS Credential Provider for testing
 */

const awsCredentialProvider = {
  getCredentials: jest.fn().mockResolvedValue({
    credentials: {
      accessKeyId: 'AKIATEST0000000FAKE',
      secretAccessKey: 'testsecreteKy000000000000000000000000FAKE',
      sessionToken: 'test-session-token',
      expiration: new Date(Date.now() + 3600000).toISOString()
    },
    region: 'us-west-2',
    source: {
      type: 'environment',
      profileName: null
    }
  }),
  
  clearCache: jest.fn(),
  
  hasCachedCredentials: jest.fn().mockReturnValue(true),
  
  _getContainerCredentials: jest.fn().mockResolvedValue({
    AccessKeyId: 'AKIATEST0000000FAKE',
    SecretAccessKey: 'testsecreteKy000000000000000000000000FAKE',
    Token: 'test-token',
    Expiration: new Date(Date.now() + 3600000).toISOString()
  })
};

module.exports = awsCredentialProvider;
module.exports.default = awsCredentialProvider;