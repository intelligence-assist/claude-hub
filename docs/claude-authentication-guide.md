# Claude Authentication Guide

This guide covers three authentication methods for using Claude with the webhook service.

## Authentication Methods Overview

| Method | Use Case | Setup Complexity |
|--------|----------|------------------|
| **Setup Container** | Personal development | Medium |
| **ANTHROPIC_API_KEY** | Production environments | Low |
| **AWS Bedrock** | Enterprise integration | High |

---

## 🐳 Option 1: Setup Container (Personal Development)

Uses personal Claude Code subscription for authentication.

### Setup Process

#### 1. Run Interactive Authentication Setup
```bash
./scripts/setup/setup-claude-interactive.sh
```

#### 2. Authenticate in Container
When the container starts:
```bash
# In the container shell:
claude --dangerously-skip-permissions  # Follow authentication flow
exit                                   # Save authentication state
```

#### 3. Test Captured Authentication
```bash
./scripts/setup/test-claude-auth.sh
```

#### 4. Use Captured Authentication
```bash
# Option A: Copy to your main Claude directory
cp -r ${CLAUDE_HUB_DIR:-~/.claude-hub}/* ~/.claude/

# Option B: Mount in docker-compose
# Update docker-compose.yml:
# - ./${CLAUDE_HUB_DIR:-~/.claude-hub}:/home/node/.claude
```

#### 5. Verify Setup
```bash
node cli/webhook-cli.js --repo "owner/repo" --command "Test authentication" --url "http://localhost:8082"
```

### Troubleshooting
- **Tokens expire**: Re-run authentication setup when needed
- **File permissions**: Ensure `.credentials.json` is readable by container user
- **Mount issues**: Verify correct path in docker-compose volume mounts

---

## 🔑 Option 2: ANTHROPIC_API_KEY (Production)

Direct API key authentication for production environments.

### Setup Process

#### 1. Get API Key
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Copy the key (starts with `sk-ant-`)

#### 2. Configure Environment
```bash
# Add to .env file
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

#### 3. Restart Service
```bash
docker compose restart webhook
```

#### 4. Test
```bash
node cli/webhook-cli.js --repo "owner/repo" --command "Test API key authentication" --url "http://localhost:8082"
```

### Best Practices
- **Key rotation**: Regularly rotate API keys
- **Environment security**: Never commit keys to version control
- **Usage monitoring**: Monitor API usage through Anthropic Console

---

## ☁️ Option 3: AWS Bedrock (Enterprise)

AWS-integrated Claude access for enterprise deployments.

### Setup Process

#### 1. Configure AWS Credentials
```bash
# Option A: AWS Profile (Recommended)
./scripts/aws/create-aws-profile.sh

# Option B: Environment Variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

#### 2. Configure Bedrock Settings
```bash
# Add to .env file
CLAUDE_CODE_USE_BEDROCK=1
ANTHROPIC_MODEL=us.anthropic.claude-3-7-sonnet-20250219-v1:0
AWS_REGION=us-east-1

# If using profiles
USE_AWS_PROFILE=true
AWS_PROFILE=claude-webhook
```

#### 3. Verify Bedrock Access
```bash
aws bedrock list-foundation-models --region us-east-1
```

#### 4. Restart Service
```bash
docker compose restart webhook
```

#### 5. Test
```bash
node cli/webhook-cli.js --repo "owner/repo" --command "Test Bedrock authentication" --url "http://localhost:8082"
```

### Best Practices
- **IAM policies**: Use minimal required permissions
- **Regional selection**: Choose appropriate AWS region
- **Access logging**: Enable CloudTrail for audit compliance

---

## 🚀 Authentication Priority and Fallback

The system checks authentication methods in this order:

1. **ANTHROPIC_API_KEY** (highest priority)
2. **Claude Interactive Authentication** (setup container)
3. **AWS Bedrock** (if configured)

### Environment Variables

```bash
# Method 1: Direct API Key
ANTHROPIC_API_KEY=sk-ant-your-key

# Method 2: Claude Interactive (automatic if ~/.claude is mounted)
# No environment variables needed

# Method 3: AWS Bedrock
CLAUDE_CODE_USE_BEDROCK=1
ANTHROPIC_MODEL=us.anthropic.claude-3-7-sonnet-20250219-v1:0
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key_id
AWS_SECRET_ACCESS_KEY=your_secret_key
# OR
USE_AWS_PROFILE=true
AWS_PROFILE=your-profile-name
```

---

## 🛠️ Switching Between Methods

You can switch between authentication methods by updating your `.env` file:

```bash
# Development with personal subscription
# Comment out API key, ensure ~/.claude is mounted
# ANTHROPIC_API_KEY=
# Mount: ~/.claude:/home/node/.claude

# Production with API key
ANTHROPIC_API_KEY=sk-ant-your-production-key

# Enterprise with Bedrock
CLAUDE_CODE_USE_BEDROCK=1
ANTHROPIC_MODEL=us.anthropic.claude-3-7-sonnet-20250219-v1:0
USE_AWS_PROFILE=true
AWS_PROFILE=production-claude
```

---

## 🔍 Troubleshooting

### Authentication Not Working
1. Check environment variables are set correctly
2. Verify API keys are valid and not expired
3. For Bedrock: Ensure AWS credentials have correct permissions
4. For setup container: Re-run authentication if tokens expired

### Rate Limiting
- **API Key**: Contact Anthropic for rate limit information
- **Bedrock**: Configure AWS throttling settings
- **Setup Container**: Limited by subscription tier

---

## 📚 Additional Resources

- [Anthropic Console](https://console.anthropic.com/) - API key management
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/) - Enterprise setup
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) - Official Claude CLI docs
- [Setup Container Deep Dive](./setup-container-guide.md) - Detailed setup container documentation

---

*This guide covers all authentication methods for the Claude GitHub Webhook service. Choose the method that best fits your technical requirements.*