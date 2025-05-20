# AWS Profile Quick Start

This guide shows you how to quickly set up AWS profiles for the Claude webhook service.

## 1. Interactive Setup (Recommended)

Run the interactive setup script:

```bash
cd scripts
./setup-aws-profiles.sh
```

This will:
- Guide you through creating AWS profiles
- Update your .env file automatically
- Test the authentication

## 2. Command Line Setup

For automated/scripted setup:

```bash
# Create a profile with your credentials
./scripts/create-aws-profile.sh claude-webhook YOUR_ACCESS_KEY YOUR_SECRET_KEY us-west-2

# Update .env file
echo "USE_AWS_PROFILE=true" >> .env
echo "AWS_PROFILE=claude-webhook" >> .env
```

## 3. Manual Setup with AWS CLI

Using AWS CLI directly:

```bash
# Create profile
aws configure set aws_access_key_id YOUR_ACCESS_KEY --profile claude-webhook
aws configure set aws_secret_access_key YOUR_SECRET_KEY --profile claude-webhook
aws configure set region us-west-2 --profile claude-webhook

# Test it
aws sts get-caller-identity --profile claude-webhook
```

## 4. Test Your Setup

Run the test script to verify everything is working:

```bash
cd test
./test-aws-profile.sh
```

## 5. Environment Variables

Update your `.env` file:

```env
# Remove these:
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx

# Add these:
USE_AWS_PROFILE=true
AWS_PROFILE=claude-webhook
AWS_REGION=us-west-2
```

## Benefits

✅ No credentials in environment variables  
✅ No credentials in docker logs  
✅ Secure file-based storage  
✅ Easy to switch between environments  
✅ Works with AWS CLI and SDKs  

## Multiple Environments

You can create multiple profiles:

```bash
# Development
./scripts/create-aws-profile.sh claude-dev DEV_KEY DEV_SECRET

# Production
./scripts/create-aws-profile.sh claude-prod PROD_KEY PROD_SECRET

# Switch between them in .env
AWS_PROFILE=claude-dev  # or claude-prod
```

## Troubleshooting

1. **Profile not found**: Check `~/.aws/credentials` exists
2. **Permission denied**: Check file permissions (should be 600)
3. **Auth fails**: Verify credentials with `aws sts get-caller-identity --profile NAME`
4. **Container issues**: Rebuild with `./build-claudecode.sh`

## Security Notes

- Profiles are stored in `~/.aws/credentials` with 600 permissions
- Container gets read-only access to credentials
- No credentials in process listings or logs
- Credentials never leave your local machine