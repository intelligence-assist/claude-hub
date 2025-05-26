# CI/CD Guidelines and Standards

This document defines the standards and best practices for our CI/CD pipelines. All workflows must adhere to these guidelines to ensure production-quality, maintainable, and secure automation.

## Core Principles

1. **Security First**: Never expose secrets, use least privilege, scan for vulnerabilities
2. **Efficiency**: Minimize build times, use caching effectively, avoid redundant work
3. **Reliability**: Proper error handling, clear failure messages, rollback capabilities
4. **Maintainability**: DRY principles, clear naming, comprehensive documentation
5. **Observability**: Detailed logs, status reporting, metrics collection

## Workflow Standards

### Naming Conventions

- **Workflow files**: Use kebab-case (e.g., `deploy-production.yml`)
- **Workflow names**: Use title case (e.g., `Deploy to Production`)
- **Job names**: Use descriptive names without redundancy (e.g., `test`, not `test-job`)
- **Step names**: Start with verb, be specific (e.g., `Build Docker image`, not `Build`)

### Environment Variables

```yaml
env:
  # Use repository variables with fallbacks
  DOCKER_REGISTRY: ${{ vars.DOCKER_REGISTRY || 'docker.io' }}
  APP_NAME: ${{ vars.APP_NAME || github.event.repository.name }}
  
  # Never hardcode:
  # - URLs (use vars.PRODUCTION_URL)
  # - Usernames (use vars.DOCKER_USERNAME)
  # - Organization names (use vars.ORG_NAME)
  # - Ports (use vars.APP_PORT)
```

### Triggers

```yaml
on:
  push:
    branches: [main]  # Production deployments
    tags: ['v*.*.*']  # Semantic version releases
  pull_request:
    branches: [main, develop]  # CI checks only, no deployments
```

### Security

1. **Permissions**: Always specify minimum required permissions
```yaml
permissions:
  contents: read
  packages: write
  security-events: write
```

2. **Secret Handling**: Never create .env files with secrets
```yaml
# BAD - Exposes secrets in logs
- run: echo "API_KEY=${{ secrets.API_KEY }}" > .env

# GOOD - Use GitHub's environment files
- run: echo "API_KEY=${{ secrets.API_KEY }}" >> $GITHUB_ENV
```

3. **Credential Scanning**: All workflows must pass credential scanning
```yaml
- name: Scan for credentials
  run: ./scripts/security/credential-audit.sh
```

### Error Handling

1. **Deployment Scripts**: Always include error handling
```yaml
- name: Deploy application
  run: |
    set -euo pipefail  # Exit on error, undefined vars, pipe failures
    
    ./deploy.sh || {
      echo "::error::Deployment failed"
      ./rollback.sh
      exit 1
    }
```

2. **Health Checks**: Verify deployments succeeded
```yaml
- name: Verify deployment
  run: |
    for i in {1..30}; do
      if curl -f "${{ vars.APP_URL }}/health"; then
        echo "Deployment successful"
        exit 0
      fi
      sleep 10
    done
    echo "::error::Health check failed after 5 minutes"
    exit 1
```

### Caching Strategy

1. **Dependencies**: Use built-in caching
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: package-lock.json
```

2. **Docker Builds**: Use GitHub Actions cache
```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

### Docker Builds

1. **Multi-platform**: Only for production releases
```yaml
platforms: ${{ github.event_name == 'release' && 'linux/amd64,linux/arm64' || 'linux/amd64' }}
```

2. **Tagging Strategy**:
```yaml
tags: |
  type=ref,event=branch
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
```

### Deployment Strategy

1. **Staging**: Automatic deployment from main branch
2. **Production**: Manual approval required, only from tags
3. **Rollback**: Automated rollback on health check failure

### Job Dependencies

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
  
  build:
    needs: test
    if: success()  # Explicit success check
    
  deploy:
    needs: [test, build]
    if: success() && github.ref == 'refs/heads/main'
```

## Common Patterns

### Conditional Docker Builds

```yaml
# Only build when Docker files or source code changes
changes:
  runs-on: ubuntu-latest
  outputs:
    docker: ${{ steps.filter.outputs.docker }}
  steps:
    - uses: dorny/paths-filter@v3
      id: filter
      with:
        filters: |
          docker:
            - 'Dockerfile*'
            - 'src/**'
            - 'package*.json'

build:
  needs: changes
  if: needs.changes.outputs.docker == 'true'
```

### Deployment with Notification

```yaml
deploy:
  runs-on: ubuntu-latest
  steps:
    - name: Deploy
      id: deploy
      run: ./deploy.sh
      
    - name: Notify status
      if: always()
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ steps.deploy.outcome }}
        text: |
          Deployment to ${{ github.event.deployment.environment }}
          Status: ${{ steps.deploy.outcome }}
          Version: ${{ github.ref_name }}
```

## Anti-Patterns to Avoid

1. **No hardcoded values**: Everything should be configurable
2. **No ignored errors**: Use proper error handling, not `|| true`
3. **No unnecessary matrix builds**: Only test multiple versions in CI, not deploy
4. **No secrets in logs**: Use masks and secure handling
5. **No missing health checks**: Always verify deployments
6. **No duplicate workflows**: Use reusable workflows for common tasks
7. **No missing permissions**: Always specify required permissions

## Workflow Types

### 1. CI Workflow (`ci.yml`)
- Runs on every PR and push
- Tests, linting, security scans
- No deployments or publishing

### 2. Deploy Workflow (`deploy.yml`)
- Runs on main branch and tags only
- Builds and deploys applications
- Includes staging and production environments

### 3. Security Workflow (`security.yml`)
- Runs on schedule and PRs
- Comprehensive security scanning
- Blocks merging on critical issues

### 4. Release Workflow (`release.yml`)
- Runs on version tags only
- Creates GitHub releases
- Publishes to package registries

## Checklist for New Workflows

- [ ] Uses environment variables instead of hardcoded values
- [ ] Specifies minimum required permissions
- [ ] Includes proper error handling
- [ ] Has health checks for deployments
- [ ] Uses caching effectively
- [ ] Follows naming conventions
- [ ] Includes security scanning
- [ ] Has clear documentation
- [ ] Avoids anti-patterns
- [ ] Tested in a feature branch first