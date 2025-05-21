# CI/CD Setup Documentation

This document outlines the CI/CD pipeline setup for the Claude GitHub Webhook project.

## Overview

The project uses GitHub Actions for CI/CD with multiple workflows:
- **Main CI Pipeline** - Testing, linting, building, and deployment
- **Security Scans** - Daily security scanning and vulnerability detection
- **Dependabot** - Automated dependency updates

## Workflows

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Jobs:**

#### Test & Lint Job
- Sets up Node.js 20
- Installs dependencies with `npm ci`
- Runs ESLint for code quality
- Executes all test suites (unit, integration, e2e)
- Generates code coverage reports
- Uploads coverage to Codecov

#### Security Job
- Runs `npm audit` for dependency vulnerabilities
- Performs Snyk security scanning (if token configured)
- Scans for high-severity vulnerabilities

#### Docker Job
- Builds both main webhook and Claude Code Docker images
- Tests container startup and health endpoints
- Uses Docker BuildKit with GitHub Actions caching

#### Build & Push Job (main branch only)
- Builds and pushes images to GitHub Container Registry
- Tags images with branch name, SHA, and `latest`
- Requires successful completion of all other jobs

#### Deploy Job (main branch only)
- Placeholder for deployment to staging environment
- Runs only after successful build and push

### 2. Security Scans (`.github/workflows/security.yml`)

**Triggers:**
- Daily at 2 AM UTC (scheduled)
- Push to `main` branch
- Pull requests to `main` branch

**Jobs:**

#### Dependency Scan
- Checks for known vulnerabilities in dependencies
- Runs `npm audit` with moderate severity threshold

#### Secret Scan
- Uses TruffleHog to scan for leaked secrets
- Scans entire repository history

#### CodeQL Analysis
- GitHub's semantic code analysis
- Scans JavaScript/Node.js code for security issues
- Results appear in Security tab

### 3. Dependabot (`.github/dependabot.yml`)

**Automated Updates:**
- **npm dependencies** - Weekly updates
- **Docker base images** - Weekly updates  
- **GitHub Actions** - Weekly updates

**Configuration:**
- Auto-assigns reviewers
- Creates up to 10 open PRs at a time
- Uses conventional commit prefixes

## Testing Strategy

### Test Types
- **Unit Tests** - Individual component testing
- **Integration Tests** - Service interaction testing
- **E2E Tests** - End-to-end workflow testing

### Test Environment
- Uses `NODE_ENV=test`
- Mock authentication tokens
- Isolated test containers

### Coverage Requirements
- Unit tests must maintain >60% coverage
- Critical paths require 100% coverage
- Coverage reports uploaded to Codecov

## Code Quality

### Linting (ESLint)
- Enforces consistent code style
- Checks for common errors and anti-patterns
- Configured for Node.js and Jest environments

### Formatting (Prettier)
- Consistent code formatting
- Automatic fix available via `npm run format`

### Pre-commit Hooks
- Runs linting and formatting checks
- Prevents commits with quality issues

## Security Measures

### Vulnerability Scanning
- Daily dependency scans
- Secret detection in code
- SAST analysis with CodeQL

### Audit Thresholds
- Fails on moderate+ severity vulnerabilities
- Auto-fix available for compatible updates

### Container Security
- Multi-stage Docker builds
- Non-root user execution
- Minimal base images

## Environment Variables

### Required for CI
```bash
NODE_ENV=test
BOT_USERNAME=@TestBot
GITHUB_WEBHOOK_SECRET=test-secret
GITHUB_TOKEN=test-token
```

### Optional for Enhanced Features
```bash
SNYK_TOKEN=xxx          # For Snyk security scanning
CODECOV_TOKEN=xxx       # For coverage reporting
```

## Docker Images

### Main Webhook Image
- **Base**: `node:20-alpine`
- **Registry**: `ghcr.io/your-org/claude-github-webhook`
- **Tags**: `latest`, `main-{sha}`, branch names

### Claude Code Runner Image
- **Base**: Custom Ubuntu with Claude Code CLI
- **Registry**: `ghcr.io/your-org/claude-github-webhook-claudecode`
- **Purpose**: Isolated Claude command execution

## Local Development

### Setup Commands
```bash
# Install dependencies
npm ci

# Setup development tools
npm run setup:dev

# Run tests
npm test

# Run linting
npm run lint

# Run formatting
npm run format
```

### Pre-push Checklist
- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint:check`
- [ ] Code formatted: `npm run format:check`
- [ ] No security issues: `npm run security:audit`

## Deployment

### Staging
- Automatic deployment on `main` branch
- Uses latest container images
- Environment-specific configuration

### Production
- Manual approval required
- Blue-green deployment strategy
- Health checks and rollback capability

## Monitoring

### CI Metrics
- Build success rate
- Test execution time
- Coverage trends

### Security Metrics
- Vulnerability count
- MTTR for security fixes
- Dependency freshness

## Troubleshooting

### Common CI Issues

#### Tests Failing
1. Check environment variables are set correctly
2. Verify dependencies are properly mocked
3. Review test logs for specific failures

#### Docker Build Failures
1. Check Dockerfile syntax
2. Verify base image availability
3. Review build context and .dockerignore

#### Security Scan Failures
1. Review vulnerability details
2. Update dependencies if possible
3. Add exceptions for false positives

### Getting Help
- Check GitHub Actions logs
- Review error messages and stack traces
- Consult documentation in `/docs/` directory