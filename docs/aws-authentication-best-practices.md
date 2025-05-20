# AWS Authentication Best Practices for Claude Repository

## Current Implementation

The Claude service currently uses static AWS credentials configured via environment variables:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

These credentials are passed to Docker containers running Claude Code CLI to interact with AWS Bedrock.

## Recommended Improvements

### 1. Use IAM Instance Profiles (EC2)

If running on AWS EC2, use IAM instance profiles instead of static credentials:

```javascript
// Check for instance metadata availability first
const AWS = require('@aws-sdk/client-sts');

async function getCredentials() {
  // Try instance metadata first
  if (await isRunningOnEC2()) {
    // AWS SDK will automatically use instance profile
    return; // No explicit credentials needed
  }
  
  // Fall back to environment variables
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
  };
}
```

### 2. Implement Temporary Credentials with STS

Use AWS Security Token Service (STS) to generate temporary credentials:

```javascript
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

async function getTemporaryCredentials(roleArn) {
  const stsClient = new STSClient({ region: process.env.AWS_REGION });
  
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `claude-webhook-${Date.now()}`,
    DurationSeconds: 3600 // 1 hour
  });
  
  const response = await stsClient.send(command);
  return response.Credentials;
}
```

### 3. Use AWS IAM Roles for Service Accounts (IRSA) in Kubernetes

If running in Kubernetes/EKS:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: claude-webhook
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/claude-webhook-role
```

### 4. Implement Credential Rotation

Add automatic credential rotation:

```javascript
class CredentialManager {
  constructor() {
    this.credentials = null;
    this.expirationTime = null;
  }
  
  async getCredentials() {
    if (!this.credentials || this.isExpired()) {
      this.credentials = await this.refreshCredentials();
      this.expirationTime = Date.now() + (50 * 60 * 1000); // 50 minutes
    }
    return this.credentials;
  }
  
  isExpired() {
    return !this.expirationTime || Date.now() > this.expirationTime;
  }
  
  async refreshCredentials() {
    // Implement credential refresh logic
    return getTemporaryCredentials(process.env.AWS_ROLE_ARN);
  }
}
```

### 5. Use AWS SDK v3 Best Practices

Update to AWS SDK v3 and use credential providers:

```javascript
const { fromInstanceMetadata, fromIni, fromProcess } = require('@aws-sdk/credential-providers');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');

// Create a credential provider chain
const credentialProvider = defaultProvider({
  region: process.env.AWS_REGION,
  // Try these providers in order
  providers: [
    fromInstanceMetadata({ timeout: 1000 }),
    fromIni({ profile: process.env.AWS_PROFILE }),
    fromProcess(),
    // Environment variables are checked by default
  ]
});
```

### 6. Secure Environment Variable Handling

Update `claudeService.js` to use more secure credential passing:

```javascript
// Instead of passing raw credentials, pass a credential provider
const credentialProvider = await getCredentialProvider();
const credentials = await credentialProvider();

// Pass temporary credentials if needed
const envVars = {
  AWS_ACCESS_KEY_ID: credentials.accessKeyId,
  AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
  AWS_SESSION_TOKEN: credentials.sessionToken, // Include for temporary creds
  AWS_REGION: process.env.AWS_REGION,
  // ... other env vars
};
```

### 7. Implement Least Privilege IAM Policies

Create a specific IAM policy for Claude webhook:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:model/us.anthropic.claude-3-*"
      ]
    }
  ]
}
```

### 8. Container-Specific Security

For Docker containers, mount credentials securely:

```javascript
// Use Docker secrets or volumes for credentials
const dockerCommand = `docker run --rm \\
  --privileged \\
  --mount type=secret,id=aws_creds,target=/run/secrets/aws-credentials \\
  ${dockerImageName}`;
```

### 9. Monitoring and Auditing

Add CloudTrail monitoring for credential usage:

```javascript
const { CloudTrailClient, PutEventsCommand } = require('@aws-sdk/client-cloudtrail');

async function logCredentialUsage(action, success) {
  const event = {
    eventTime: new Date(),
    eventName: 'ClaudeWebhookCredentialUsage',
    eventSource: 'claude-webhook',
    sourceIPAddress: req.ip,
    userAgent: req.headers['user-agent'],
    resources: [{
      type: 'AWS::IAM::Credentials',
      name: action
    }],
    outcome: success ? 'Success' : 'Failure'
  };
  
  // Log to CloudTrail or your monitoring system
}
```

## Implementation Priority

1. **High Priority**: 
   - Implement temporary credentials with STS
   - Add credential rotation
   - Remove hardcoded credentials from `update-aws-creds.sh`

2. **Medium Priority**:
   - Migrate to IAM instance profiles (if on EC2)
   - Update to AWS SDK v3
   - Implement least privilege IAM policies

3. **Low Priority**:
   - Add CloudTrail monitoring
   - Implement container-specific secrets

## Security Checklist

- [ ] Remove static credentials from code and scripts
- [ ] Implement credential rotation
- [ ] Use temporary credentials whenever possible
- [ ] Apply least privilege IAM policies
- [ ] Monitor credential usage
- [ ] Secure credential passing to containers
- [ ] Add credential expiration handling
- [ ] Document credential requirements

## Testing

After implementing changes, test with:

```bash
# Test with instance profile
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
./test-claude-api.js owner/repo

# Test with assumed role
export AWS_ROLE_ARN="arn:aws:iam::123456789012:role/claude-webhook-role"
./test-claude-api.js owner/repo

# Test credential rotation
./test-credential-rotation.js
```

## References

- [AWS SDK for JavaScript v3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS STS AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- [EKS IAM Roles for Service Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)