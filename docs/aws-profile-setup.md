# Using AWS Profiles Instead of Environment Variables

This guide shows how to use AWS profiles with the Claude webhook service for better security.

## Why Use AWS Profiles?

- Credentials are stored in `~/.aws/credentials` (protected by file permissions)
- Not exposed in environment variables or process lists
- Can easily switch between different AWS accounts
- Works with AWS CLI and SDKs

## Setup

### 1. Configure AWS Profile

```bash
# Create a profile for Claude webhook
aws configure --profile claude-webhook

# You'll be prompted for:
# AWS Access Key ID: your-access-key
# AWS Secret Access Key: your-secret-key
# Default region name: us-west-2
# Default output format: json
```

### 2. Update Your .env File

Instead of storing credentials, just reference the profile:

```env
# Remove these:
# AWS_ACCESS_KEY_ID=your-key
# AWS_SECRET_ACCESS_KEY=your-secret

# Add these:
USE_AWS_PROFILE=true
AWS_PROFILE=claude-webhook
AWS_REGION=us-west-2
```

### 3. Update Dockerfile (if building custom image)

Add this to your Dockerfile:

```dockerfile
# Create .aws directory for the node user
RUN mkdir -p /home/node/.aws && chown -R node:node /home/node/.aws
```

### 4. Start the Service

The service will now:
1. Mount your `~/.aws` directory into the container
2. Use the specified AWS profile
3. No credentials in environment variables!

```bash
npm start
```

## How It Works

1. When `USE_AWS_PROFILE=true`, the service adds `-v ~/.aws:/home/node/.aws:ro` to the Docker command
2. The container has read-only access to your AWS credentials
3. The AWS SDK inside the container uses the profile specified in `AWS_PROFILE`

## Security Benefits

- **No credentials in logs**: Docker logs won't contain credentials
- **No process listing exposure**: `ps aux` won't show credentials
- **File permission protection**: AWS credentials file has 600 permissions
- **Read-only access**: Container can't modify your credentials

## Multiple Profiles

You can have multiple profiles for different environments:

```bash
# Production
aws configure --profile claude-prod

# Development
aws configure --profile claude-dev

# Testing
aws configure --profile claude-test
```

Then switch between them in your .env:

```env
AWS_PROFILE=claude-prod  # or claude-dev, claude-test
```

## Troubleshooting

1. **Permission Denied**: Check that `~/.aws/credentials` has proper permissions (600)
2. **Profile Not Found**: Ensure the profile name matches exactly
3. **Region Issues**: Make sure AWS_REGION is set in .env

## Alternative: IAM Roles (EC2/ECS)

If running on AWS infrastructure, you can use IAM roles instead:

- **EC2**: Attach an IAM role to the instance
- **ECS**: Use task roles
- **EKS**: Use service accounts with IRSA

These provide credentials automatically without any configuration!