const { createLogger } = require('./logger');

const logger = createLogger('awsCredentialProvider');

/**
 * AWS Credential Provider for secure credential management
 * Implements best practices for AWS authentication
 */
class AWSCredentialProvider {
  constructor() {
    this.credentials = null;
    this.expirationTime = null;
    this.credentialSource = null;
  }

  /**
   * Get AWS credentials - PROFILES ONLY
   * 
   * This method implements a caching mechanism to avoid repeatedly reading 
   * credential files. It checks for cached credentials first, and only reads
   * from the filesystem if necessary.
   * 
   * The cached credentials are cleared when:
   * 1. clearCache() is called explicitly
   * 2. When credentials expire (for temporary credentials)
   * 
   * Static credentials from profiles don't expire, so they remain cached
   * until the process ends or cache is explicitly cleared.
   * 
   * @returns {Promise<Object>} Credential object with accessKeyId, secretAccessKey, and region
   * @throws {Error} If AWS_PROFILE is not set or credential retrieval fails
   */
  async getCredentials() {
    if (!process.env.AWS_PROFILE) {
      throw new Error('AWS_PROFILE must be set. Direct credential passing is not supported.');
    }

    // Return cached credentials if available and not expired
    if (this.credentials && !this.isExpired()) {
      logger.info('Using cached credentials');
      return this.credentials;
    }

    logger.info('Using AWS profile authentication only');

    try {
      this.credentials = await this.getProfileCredentials(process.env.AWS_PROFILE);
      this.credentialSource = `AWS Profile (${process.env.AWS_PROFILE})`;
      return this.credentials;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get AWS credentials from profile');
      throw error;
    }
  }

  /**
   * Check if credentials have expired
   */
  isExpired() {
    if (!this.expirationTime) {
      return false; // Static credentials don't expire
    }
    return Date.now() > this.expirationTime;
  }

  /**
   * Check if running on EC2 instance
   */
  async isEC2Instance() {
    try {
      const response = await fetch('http://169.254.169.254/latest/meta-data/', {
        timeout: 1000
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get credentials from EC2 instance metadata
   */
  async getInstanceMetadataCredentials() {
    const tokenResponse = await fetch('http://169.254.169.254/latest/api/token', {
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600'
      },
      timeout: 1000
    });

    const token = await tokenResponse.text();

    const roleResponse = await fetch(
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      {
        headers: {
          'X-aws-ec2-metadata-token': token
        },
        timeout: 1000
      }
    );

    const roleName = await roleResponse.text();

    const credentialsResponse = await fetch(
      `http://169.254.169.254/latest/meta-data/iam/security-credentials/${roleName}`,
      {
        headers: {
          'X-aws-ec2-metadata-token': token
        },
        timeout: 1000
      }
    );

    const credentials = await credentialsResponse.json();

    this.expirationTime = new Date(credentials.Expiration).getTime();

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.Token,
      region: process.env.AWS_REGION
    };
  }

  /**
   * Get credentials from ECS container metadata
   */
  async getECSCredentials() {
    const uri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    const response = await fetch(`http://169.254.170.2${uri}`, {
      timeout: 1000
    });

    const credentials = await response.json();

    this.expirationTime = new Date(credentials.Expiration).getTime();

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.Token,
      region: process.env.AWS_REGION
    };
  }

  /**
   * Get credentials from AWS profile
   */
  async getProfileCredentials(profileName) {
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');

    const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
    const configPath = path.join(os.homedir(), '.aws', 'config');

    try {
      // Read credentials file
      const credentialsContent = await fs.readFile(credentialsPath, 'utf8');
      const configContent = await fs.readFile(configPath, 'utf8');

      // Parse credentials for the specific profile
      const profileRegex = new RegExp(`\\[${profileName}\\]([^\\[]*)`);
      const credentialsMatch = credentialsContent.match(profileRegex);
      const configMatch = configContent.match(new RegExp(`\\[profile ${profileName}\\]([^\\[]*)`));

      if (!credentialsMatch && !configMatch) {
        throw new Error(`Profile '${profileName}' not found`);
      }

      const credentialsSection = credentialsMatch ? credentialsMatch[1] : '';
      const configSection = configMatch ? configMatch[1] : '';

      // Extract credentials
      const accessKeyMatch = credentialsSection.match(/aws_access_key_id\s*=\s*(.+)/);
      const secretKeyMatch = credentialsSection.match(/aws_secret_access_key\s*=\s*(.+)/);
      const regionMatch = configSection.match(/region\s*=\s*(.+)/);

      if (!accessKeyMatch || !secretKeyMatch) {
        throw new Error(`Incomplete credentials for profile '${profileName}'`);
      }

      return {
        accessKeyId: accessKeyMatch[1].trim(),
        secretAccessKey: secretKeyMatch[1].trim(),
        region: regionMatch ? regionMatch[1].trim() : process.env.AWS_REGION
      };
    } catch (error) {
      logger.error({ error: error.message, profile: profileName }, 'Failed to read AWS profile');
      throw error;
    }
  }

  /**
   * Get environment variables for Docker container
   * PROFILES ONLY - No credential passing through environment variables
   */
  async getDockerEnvVars() {
    if (!process.env.AWS_PROFILE) {
      throw new Error('AWS_PROFILE must be set. Direct credential passing is not supported.');
    }

    logger.info(
      {
        profile: process.env.AWS_PROFILE
      },
      'Using AWS profile authentication only'
    );

    return {
      AWS_PROFILE: process.env.AWS_PROFILE,
      AWS_REGION: process.env.AWS_REGION
    };
  }

  /**
   * Clear cached credentials (useful for testing or rotation)
   */
  clearCache() {
    this.credentials = null;
    this.expirationTime = null;
    this.credentialSource = null;
    logger.info('Cleared credential cache');
  }
}

// Export singleton instance
module.exports = new AWSCredentialProvider();
