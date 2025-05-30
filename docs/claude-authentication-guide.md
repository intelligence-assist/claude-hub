# Claude Authentication Guide

This guide covers three authentication methods for using Claude with the webhook service, each designed for different use cases and requirements.

## Authentication Methods Overview

| Method | Best For | Cost | Stability | Setup Complexity |
|--------|----------|------|-----------|------------------|
| **Setup Container** | Development/Personal | ~$20-200/month | Good | Medium |
| **ANTHROPIC_API_KEY** | Production/Team | High usage costs | Excellent | Low |
| **AWS Bedrock** | Enterprise | Moderate | Excellent | High |

---

## 🐳 Option 1: Setup Container (Development/Personal)

**Best for:** Developers with Claude Max subscriptions ($100-200/month) who want to use their existing subscription for automation. Note: Claude Code is not included with Claude Pro ($20/month).

### Advantages
- ✅ **Cost-effective**: Use your existing Claude subscription
- ✅ **Full feature access**: Access to latest models included in subscription
- ✅ **No API key management**: Uses OAuth tokens
- ✅ **Reusable authentication**: Capture once, use everywhere

### Limitations
- ⚠️ **Less stable**: OAuth tokens may expire
- ⚠️ **Development-focused**: Not recommended for high-volume production
- ⚠️ **Setup required**: Requires interactive authentication

### Setup Process

#### 1. Run Interactive Authentication Setup
```bash
./scripts/setup/setup-claude-interactive.sh
```

#### 2. Authenticate in Container
When the container starts:
```bash
# In the container shell:
claude login
# Follow browser authentication flow
claude status  # Verify authentication
exit          # Save authentication state
```

#### 3. Test Captured Authentication
```bash
./scripts/setup/test-claude-auth.sh
```

#### 4. Use Captured Authentication
```bash
# Option A: Copy to your main Claude directory
cp -r claude-auth-output/* ~/.claude/

# Option B: Mount in docker-compose
# Update docker-compose.yml:
# - ./claude-auth-output:/home/node/.claude:ro
```

#### 5. Verify Setup
```bash
# Test webhook with your subscription
node cli/webhook-cli.js --repo "owner/repo" --command "Test my Claude subscription" --url "http://localhost:8082"
```

### Troubleshooting
- **OAuth tokens expire**: Re-run authentication setup when needed
- **File permissions**: Ensure `.credentials.json` is readable by container user
- **Mount issues**: Verify correct path in docker-compose volume mounts

---

## 🔑 Option 2: ANTHROPIC_API_KEY (Production/Team)

**Best for:** Production environments, team usage, or when you need guaranteed stability and higher rate limits.

### Advantages
- ✅ **Highly stable**: Direct API key authentication
- ✅ **Higher limits**: Production-grade rate limits
- ✅ **Simple setup**: Just set environment variable
- ✅ **Team-friendly**: Multiple developers can use same key

### Limitations
- 💰 **High costs**: Pay-per-use pricing can be expensive
- 🔒 **Requires API access**: Need Anthropic Console access

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
- **Usage monitoring**: Monitor API usage and costs
- **Rate limiting**: Implement appropriate rate limiting for your use case

---

## ☁️ Option 3: AWS Bedrock (Enterprise)

**Best for:** Enterprise deployments, AWS-integrated environments, or when you need the highest stability and compliance.

### Advantages
- ✅ **Enterprise-grade**: Highest stability and reliability
- ✅ **AWS integration**: Works with existing AWS infrastructure
- ✅ **Compliance**: Meets enterprise security requirements
- ✅ **Cost predictable**: More predictable pricing models
- ✅ **Regional deployment**: Data residency control

### Limitations
- 🔧 **Complex setup**: Requires AWS configuration
- 📋 **AWS knowledge**: Requires familiarity with AWS services
- 🏢 **Enterprise-focused**: May be overkill for individual developers

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
# Test AWS Bedrock access
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

### Available Models
- `us.anthropic.claude-3-7-sonnet-20250219-v1:0` - Latest Claude 3.5 Sonnet
- `us.anthropic.claude-3-5-haiku-20241022-v1:0` - Claude 3.5 Haiku (faster/cheaper)
- `us.anthropic.claude-3-opus-20240229-v1:0` - Claude 3 Opus (most capable)

### Best Practices
- **IAM policies**: Use minimal required permissions
- **Regional selection**: Choose region closest to your users
- **Cost monitoring**: Set up CloudWatch billing alerts
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

## 📊 Cost Comparison

### Setup Container (Personal/Development)
- **Claude Max**: $20/month unlimited
- **Claude 20x**: $200/month unlimited (20x faster)
- **Perfect for**: Individual developers, hobbyists, development workflows

### ANTHROPIC_API_KEY (Production)
- **Pricing**: Pay-per-token usage
- **Claude 3.5 Sonnet**: ~$15 per million tokens
- **High volume**: Can easily exceed $100s/month
- **Perfect for**: Production applications, team environments

### AWS Bedrock (Enterprise)
- **Pricing**: Pay-per-token with enterprise features
- **Claude 3.5 Sonnet**: Similar to API pricing
- **Additional costs**: AWS infrastructure, data transfer
- **Perfect for**: Enterprise deployments, compliance requirements

---

## 🛠️ Switching Between Methods

You can easily switch between authentication methods by updating your `.env` file:

```bash
# Development with personal subscription
# Comment out API key, ensure ~/.claude is mounted
# ANTHROPIC_API_KEY=
# Mount: ~/.claude:/home/node/.claude:ro

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
4. For setup container: Re-run authentication if OAuth tokens expired

### Rate Limiting
- **API Key**: Contact Anthropic for rate limit increases
- **Bedrock**: Configure AWS throttling settings
- **Setup Container**: Limited by subscription tier

### Cost Monitoring
- **API Key**: Monitor usage in Anthropic Console
- **Bedrock**: Set up AWS billing alerts
- **Setup Container**: Covered by subscription

---

## 📚 Additional Resources

- [Anthropic Console](https://console.anthropic.com/) - API key management
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/) - Enterprise setup
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) - Official Claude CLI docs
- [Setup Container Deep Dive](./setup-container-guide.md) - Detailed setup container documentation

---

## 🎯 Recommendations by Use Case

### Individual Developer
- **Start with**: Setup Container (use your Claude Max subscription)
- **Upgrade to**: API Key if you need higher stability

### Small Team
- **Recommended**: ANTHROPIC_API_KEY with cost monitoring
- **Alternative**: Multiple setup containers for development

### Enterprise
- **Recommended**: AWS Bedrock with full compliance setup
- **Alternative**: ANTHROPIC_API_KEY with enterprise support contract

---

*This guide covers all authentication methods for the Claude GitHub Webhook service. Choose the method that best fits your needs, budget, and technical requirements.*