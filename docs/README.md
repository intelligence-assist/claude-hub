# Claude Hub Documentation

Welcome to the Claude GitHub Webhook service documentation! This service enables Claude AI to respond to GitHub events and automate repository workflows.

## 📋 Quick Start Guides

### For Developers with Claude Subscriptions
**💡 Recommended for personal projects and development**

You can use your existing Claude Max subscription (5x or 20x plans) instead of paying API fees:

1. **[Setup Container Authentication](./setup-container-guide.md)** - Use your subscription for automation
2. **[Complete Authentication Guide](./claude-authentication-guide.md)** - All authentication methods

### For Production and Teams
**🏢 Recommended for production applications**

- **[ANTHROPIC_API_KEY Setup](./claude-authentication-guide.md#-option-2-anthropic_api_key-productionteam)** - Direct API key authentication
- **[AWS Bedrock Setup](./claude-authentication-guide.md#️-option-3-aws-bedrock-enterprise)** - Enterprise-grade deployment

## 🚀 Key Features

### GitHub Integration
- **Auto-tagging**: Automatically categorize and label new issues
- **PR Reviews**: Comprehensive automated pull request reviews
- **Webhook Responses**: Claude responds to mentions in issues and PRs
- **CLI Access**: Direct command-line interface for testing

### Authentication Flexibility
- **Personal**: Use Claude Max subscriptions (5x or 20x plans) via setup container
- **Production**: ANTHROPIC_API_KEY for stable production usage
- **Enterprise**: AWS Bedrock integration for compliance and scale

### Security & Reliability
- **Container Isolation**: Secure execution environment
- **Credential Management**: Multiple secure authentication methods
- **Rate Limiting**: Built-in protection against abuse
- **Logging**: Comprehensive audit trail

## 📚 Documentation Index

### Getting Started
- **[Main README](../README.md)** - Project overview and basic setup
- **[CLAUDE.md](../CLAUDE.md)** - Complete build and run commands
- **[Authentication Guide](./claude-authentication-guide.md)** - Choose your auth method

### Authentication Methods
- **[Setup Container Guide](./setup-container-guide.md)** - Use your Claude subscription
- **[AWS Authentication](./aws-authentication-best-practices.md)** - Enterprise AWS setup
- **[Credential Security](./credential-security.md)** - Security best practices

### Workflows & CI/CD
- **[Complete Workflow](./complete-workflow.md)** - End-to-end process documentation
- **[GitHub Workflow](./github-workflow.md)** - GitHub-specific integration
- **[Docker CI/CD](./docker-ci-cd.md)** - Container deployment
- **[PR Review Workflow](./pr-review-workflow.md)** - Automated code reviews

### Container & Deployment
- **[Container Setup](./container-setup.md)** - Docker configuration
- **[Container Limitations](./container-limitations.md)** - Known constraints
- **[Docker Optimization](./docker-optimization.md)** - Performance tuning

### Security & Operations
- **[Logging Security](./logging-security.md)** - Secure logging practices
- **[Pre-commit Setup](./pre-commit-setup.md)** - Code quality automation
- **[Scripts Documentation](./SCRIPTS.md)** - Available utility scripts

## 🎯 Authentication Method Selection

### Individual Developers
- **Setup Container**: Use existing Claude Max subscription for automation
- **API Key**: Direct API access for stable production usage

### Small Teams
- **ANTHROPIC_API_KEY**: Recommended for team environments
- **Setup Container**: Alternative for development workflows

### Enterprise
- **AWS Bedrock**: Enterprise-grade deployment with compliance features
- **ANTHROPIC_API_KEY**: Alternative with enterprise support

## 🔧 Quick Commands

### Authentication Setup
```bash
# Personal/Development (use Claude subscription)
./scripts/setup/setup-claude-interactive.sh

# Production (API key)
echo "ANTHROPIC_API_KEY=sk-ant-your-key" >> .env

# Enterprise (AWS Bedrock)
./scripts/aws/create-aws-profile.sh
```

### Service Management
```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f webhook

# Restart services
docker compose restart webhook

# Test webhook
node cli/webhook-cli.js --repo "owner/repo" --command "Hello Claude!" --url "http://localhost:8082"
```

### Development
```bash
# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build
```

## 🆘 Support & Troubleshooting

### Common Issues
1. **Authentication Problems**: See [Authentication Guide](./claude-authentication-guide.md)
2. **Container Issues**: Check [Container Limitations](./container-limitations.md)
3. **GitHub Integration**: Review [GitHub Workflow](./github-workflow.md)
4. **Performance**: Consult [Docker Optimization](./docker-optimization.md)

### Getting Help
- **Documentation**: Check the relevant guide above
- **Logs**: Use `docker compose logs -f webhook` for debugging
- **Testing**: Use CLI tools for isolated testing
- **Community**: Share experiences and solutions

## Technical Features

### Setup Container Method
The setup container approach captures Claude CLI authentication state for use in automated environments, enabling subscription-based authentication.

### Multi-tier Authentication
Supports multiple authentication methods from personal development to enterprise deployment with security and compliance features.

### Production Ready
Includes comprehensive logging, security, container isolation, and monitoring capabilities for production usage.

---

**Getting Started**: Choose your authentication method and follow the corresponding guide above.