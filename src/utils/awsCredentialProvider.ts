/* global AbortSignal */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from './logger';
import type { AWSCredentials, AWSCredentialProviderResult, AWSCredentialError } from '../types/aws';

const logger = createLogger('awsCredentialProvider');

/**
 * AWS Credential Provider for secure credential management
 * Implements best practices for AWS authentication
 */
class AWSCredentialProvider {
  private credentials: AWSCredentials | null = null;
  private expirationTime: number | null = null;
  private credentialSource: string | null = null;

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
   * @throws {AWSCredentialError} If AWS_PROFILE is not set or credential retrieval fails
   */
  async getCredentials(): Promise<AWSCredentialProviderResult> {
    if (!process.env['AWS_PROFILE']) {
      const error = new Error(
        'AWS_PROFILE must be set. Direct credential passing is not supported.'
      ) as AWSCredentialError;
      error.code = 'MISSING_PROFILE';
      throw error;
    }

    // Return cached credentials if available and not expired
    if (this.credentials && !this.isExpired()) {
      logger.info('Using cached credentials');
      return {
        credentials: this.credentials,
        source: {
          type: 'profile',
          profileName: process.env['AWS_PROFILE'],
          isDefault: false
        }
      };
    }

    logger.info('Using AWS profile authentication only');

    try {
      this.credentials = await this.getProfileCredentials(process.env['AWS_PROFILE']);
      this.credentialSource = `AWS Profile (${process.env['AWS_PROFILE']})`;

      return {
        credentials: this.credentials,
        source: {
          type: 'profile',
          profileName: process.env['AWS_PROFILE'],
          isDefault: false
        }
      };
    } catch (error) {
      const awsError = error as AWSCredentialError;
      awsError.code = awsError.code || 'PROFILE_ERROR';
      logger.error({ error: awsError.message }, 'Failed to get AWS credentials from profile');
      throw awsError;
    }
  }

  /**
   * Check if credentials have expired
   */
  private isExpired(): boolean {
    if (!this.expirationTime) {
      return false; // Static credentials don't expire
    }
    return Date.now() > this.expirationTime;
  }

  /**
   * Check if running on EC2 instance
   */
  async isEC2Instance(): Promise<boolean> {
    try {
      const response = await fetch('http://169.254.169.254/latest/meta-data/', {
        signal: AbortSignal.timeout(1000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get credentials from EC2 instance metadata
   */
  async getInstanceMetadataCredentials(): Promise<AWSCredentials> {
    try {
      const tokenResponse = await fetch('http://169.254.169.254/latest/api/token', {
        method: 'PUT',
        headers: {
          'X-aws-ec2-metadata-token-ttl-seconds': '21600'
        },
        signal: AbortSignal.timeout(1000)
      });

      const token = await tokenResponse.text();

      const roleResponse = await fetch(
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        {
          headers: {
            'X-aws-ec2-metadata-token': token
          },
          signal: AbortSignal.timeout(1000)
        }
      );

      const roleName = await roleResponse.text();

      const credentialsResponse = await fetch(
        `http://169.254.169.254/latest/meta-data/iam/security-credentials/${roleName}`,
        {
          headers: {
            'X-aws-ec2-metadata-token': token
          },
          signal: AbortSignal.timeout(1000)
        }
      );

      const credentials = (await credentialsResponse.json()) as {
        AccessKeyId: string;
        SecretAccessKey: string;
        Token: string;
        Expiration: string;
      };

      this.expirationTime = new Date(credentials.Expiration).getTime();

      return {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.Token,
        region: process.env.AWS_REGION
      };
    } catch (error) {
      const awsError = new Error(
        `Failed to get EC2 instance credentials: ${error}`
      ) as AWSCredentialError;
      awsError.code = 'EC2_METADATA_ERROR';
      throw awsError;
    }
  }

  /**
   * Get credentials from ECS container metadata
   */
  async getECSCredentials(): Promise<AWSCredentials> {
    const uri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    if (!uri) {
      const error = new Error(
        'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI not set'
      ) as AWSCredentialError;
      error.code = 'MISSING_ECS_URI';
      throw error;
    }

    try {
      const response = await fetch(`http://169.254.170.2${uri}`, {
        signal: AbortSignal.timeout(1000)
      });

      const credentials = (await response.json()) as {
        AccessKeyId: string;
        SecretAccessKey: string;
        Token: string;
        Expiration: string;
      };

      this.expirationTime = new Date(credentials.Expiration).getTime();

      return {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.Token,
        region: process.env.AWS_REGION
      };
    } catch (error) {
      const awsError = new Error(`Failed to get ECS credentials: ${error}`) as AWSCredentialError;
      awsError.code = 'ECS_METADATA_ERROR';
      throw awsError;
    }
  }

  /**
   * Get credentials from AWS profile
   */
  private async getProfileCredentials(profileName: string): Promise<AWSCredentials> {
    const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
    const configPath = path.join(os.homedir(), '.aws', 'config');

    try {
      // Read credentials file
      const credentialsContent = await fs.readFile(credentialsPath, 'utf8');
      const configContent = await fs.readFile(configPath, 'utf8');

      // Parse credentials for the specific profile (escape profile name to prevent regex injection)
      const escapedProfileName = profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const profileRegex = new RegExp(`\\[${escapedProfileName}\\]([^\\[]*)`);
      const credentialsMatch = credentialsContent.match(profileRegex);
      const configMatch = configContent.match(new RegExp(`\\[profile ${escapedProfileName}\\]([^\\[]*)`));

      if (!credentialsMatch && !configMatch) {
        const error = new Error(`Profile '${profileName}' not found`) as AWSCredentialError;
        error.code = 'PROFILE_NOT_FOUND';
        throw error;
      }

      const credentialsSection = credentialsMatch ? credentialsMatch[1] : '';
      const configSection = configMatch ? configMatch[1] : '';

      // Extract credentials
      const accessKeyMatch = credentialsSection.match(/aws_access_key_id\s*=\s*(.+)/);
      const secretKeyMatch = credentialsSection.match(/aws_secret_access_key\s*=\s*(.+)/);
      const regionMatch = configSection.match(/region\s*=\s*(.+)/);

      if (!accessKeyMatch || !secretKeyMatch) {
        const error = new Error(
          `Incomplete credentials for profile '${profileName}'`
        ) as AWSCredentialError;
        error.code = 'INCOMPLETE_CREDENTIALS';
        throw error;
      }

      return {
        accessKeyId: accessKeyMatch[1].trim(),
        secretAccessKey: secretKeyMatch[1].trim(),
        region: regionMatch ? regionMatch[1].trim() : process.env.AWS_REGION
      };
    } catch (error) {
      const awsError = error as AWSCredentialError;
      if (!awsError.code) {
        awsError.code = 'PROFILE_READ_ERROR';
      }
      logger.error({ error: awsError.message, profile: profileName }, 'Failed to read AWS profile');
      throw awsError;
    }
  }

  /**
   * Get environment variables for Docker container
   * PROFILES ONLY - No credential passing through environment variables
   */
  getDockerEnvVars(): Record<string, string | undefined> {
    if (!process.env.AWS_PROFILE) {
      const error = new Error(
        'AWS_PROFILE must be set. Direct credential passing is not supported.'
      ) as AWSCredentialError;
      error.code = 'MISSING_PROFILE';
      throw error;
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
  clearCache(): void {
    this.credentials = null;
    this.expirationTime = null;
    this.credentialSource = null;
    logger.info('Cleared credential cache');
  }

  /**
   * Get current credential source information
   */
  getCredentialSource(): string | null {
    return this.credentialSource;
  }

  /**
   * Get cached credentials without fetching new ones
   */
  getCachedCredentials(): AWSCredentials | null {
    if (this.credentials && !this.isExpired()) {
      return this.credentials;
    }
    return null;
  }

  /**
   * Check if credentials are currently cached and valid
   */
  hasCachedCredentials(): boolean {
    return this.credentials !== null && !this.isExpired();
  }
}

// Export singleton instance
const awsCredentialProvider = new AWSCredentialProvider();
export default awsCredentialProvider;
export { AWSCredentialProvider };
