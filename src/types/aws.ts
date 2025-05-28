export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
}

export interface AWSProfile {
  name: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  roleArn?: string;
  sourceProfile?: string;
  mfaSerial?: string;
  externalId?: string;
}

export interface AWSCredentialSource {
  type: 'profile' | 'instance' | 'task' | 'environment' | 'static';
  profileName?: string;
  isDefault?: boolean;
}

export interface AWSCredentialProviderOptions {
  profileName?: string;
  region?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface AWSCredentialProviderResult {
  credentials: AWSCredentials;
  source: AWSCredentialSource;
  expiresAt?: Date;
}

export interface AWSInstanceMetadata {
  region: string;
  availabilityZone: string;
  instanceId: string;
  instanceType: string;
  localHostname: string;
  localIpv4: string;
  publicHostname?: string;
  publicIpv4?: string;
}

export interface AWSTaskCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
}

export interface AWSCredentialError extends Error {
  code: string;
  statusCode?: number;
  retryable?: boolean;
  time?: Date;
}

// Configuration types for AWS credential management
export interface AWSCredentialConfig {
  defaultProfile?: string;
  credentialsFile?: string;
  configFile?: string;
  httpOptions?: {
    timeout?: number;
    connectTimeout?: number;
  };
  maxRetries?: number;
  retryDelayOptions?: {
    base?: number;
    customBackoff?: (retryCount: number) => number;
  };
}

// Bedrock-specific types
export interface BedrockConfig extends AWSCredentialConfig {
  region: string;
  model?: string;
  endpoint?: string;
}

export interface BedrockCredentials extends AWSCredentials {
  region: string;
}