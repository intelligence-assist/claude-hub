# Docker Build Optimization Guide

This document describes the optimizations implemented in our Docker CI/CD pipeline for faster builds and better caching.

## Overview

Our optimized Docker build pipeline includes:
- Self-hosted runner support with automatic fallback
- Multi-stage builds for efficient layering
- Advanced caching strategies
- Container-based testing
- Parallel builds for multiple images
- Security scanning integration

## Self-Hosted Runners

### Configuration
- **Labels**: `self-hosted, linux, x64, docker`
- **Usage**: All Docker builds use self-hosted runners by default for improved performance
- **Local Cache**: Self-hosted runners maintain Docker layer cache between builds
- **Fallback**: Configurable via `USE_SELF_HOSTED` repository variable

### Runner Setup
Self-hosted runners provide:
- Persistent Docker layer cache
- Faster builds (no image pull overhead)  
- Better network throughput for pushing images
- Cost savings on GitHub Actions minutes

### Fallback Strategy
The workflow implements a flexible fallback mechanism:

1. **Default behavior**: Uses self-hosted runners (`self-hosted, linux, x64, docker`)
2. **Override option**: Set repository variable `USE_SELF_HOSTED=false` to force GitHub-hosted runners
3. **Timeout protection**: 30-minute timeout prevents hanging on unavailable runners
4. **Failure detection**: `build-fallback` job provides instructions if self-hosted runners fail

To manually switch to GitHub-hosted runners:
```bash
# Via GitHub UI: Settings → Secrets and variables → Actions → Variables
# Add: USE_SELF_HOSTED = false

# Or via GitHub CLI:
gh variable set USE_SELF_HOSTED --body "false"
```

The runner selection logic:
```yaml
runs-on: ${{ fromJSON(format('["{0}"]', (vars.USE_SELF_HOSTED == 'false' && 'ubuntu-latest' || 'self-hosted, linux, x64, docker'))) }}
```

## Multi-Stage Dockerfile

Our Dockerfile uses multiple stages for optimal caching and smaller images:

1. **Builder Stage**: Compiles TypeScript
2. **Prod-deps Stage**: Installs production dependencies only
3. **Test Stage**: Includes dev dependencies and test files
4. **Production Stage**: Minimal runtime image

### Benefits
- Parallel builds of independent stages
- Smaller final image (no build tools or dev dependencies)
- Test stage can run in CI without affecting production image
- Better layer caching between builds

## Caching Strategies

### 1. GitHub Actions Cache (GHA)
```yaml
cache-from: type=gha,scope=${{ matrix.image }}-prod
cache-to: type=gha,mode=max,scope=${{ matrix.image }}-prod
```

### 2. Registry Cache
```yaml
cache-from: type=registry,ref=${{ org }}/claude-hub:nightly
```

### 3. Inline Cache
```yaml
build-args: BUILDKIT_INLINE_CACHE=1
outputs: type=inline
```

### 4. Layer Ordering
- Package files copied first (changes less frequently)
- Source code copied after dependencies
- Build artifacts cached between stages

## Container-Based Testing

Tests run inside Docker containers for:
- Consistent environment
- Parallel test execution
- Isolation from host system
- Same environment as production

### Test Execution
```bash
# Unit tests in container
docker run --rm claude-hub:test npm test

# Integration tests with docker-compose
docker-compose -f docker-compose.test.yml run integration-test

# E2E tests against running services
docker-compose -f docker-compose.test.yml run e2e-test
```

## Build Performance Optimizations

### 1. BuildKit Features
- `DOCKER_BUILDKIT=1` for improved performance
- `--mount=type=cache` for package manager caches
- Parallel stage execution

### 2. Docker Buildx
- Multi-platform builds (amd64, arm64)
- Advanced caching backends
- Build-only stages that don't ship to production

### 3. Context Optimization
- `.dockerignore` excludes unnecessary files
- Minimal context sent to Docker daemon
- Faster uploads and builds

### 4. Dependency Caching
- Separate stage for production dependencies
- npm ci with --omit=dev for smaller images
- Cache mount for npm packages

## Workflow Features

### PR Builds
- Build and test without publishing
- Single platform (amd64) for speed
- Container-based test execution
- Security scanning with Trivy

### Main Branch Builds
- Multi-platform builds (amd64, arm64)
- Push to registry with :nightly tag
- Update cache images
- Full test suite execution

### Version Tag Builds
- Semantic versioning tags
- :latest tag update
- Multi-platform support
- Production-ready images

## Security Scanning

### Integrated Scanners
1. **Trivy**: Vulnerability scanning for Docker images
2. **Hadolint**: Dockerfile linting
3. **npm audit**: Dependency vulnerability checks
4. **SARIF uploads**: Results visible in GitHub Security tab

## Monitoring and Metrics

### Build Performance
- Build time per stage
- Cache hit rates
- Image size tracking
- Test execution time

### Health Checks
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Local Development

### Building locally
```bash
# Build with BuildKit
DOCKER_BUILDKIT=1 docker build -t claude-hub:local .

# Build specific stage
docker build --target test -t claude-hub:test .

# Run tests locally
docker-compose -f docker-compose.test.yml run test
```

### Cache Management
```bash
# Clear builder cache
docker builder prune

# Use local cache
docker build --cache-from claude-hub:local .
```

## Best Practices

1. **Order Dockerfile commands** from least to most frequently changing
2. **Use specific versions** for base images and dependencies
3. **Minimize layers** by combining RUN commands
4. **Clean up** package manager caches in the same layer
5. **Use multi-stage builds** to reduce final image size
6. **Leverage BuildKit** features for better performance
7. **Test in containers** for consistency across environments
8. **Monitor build times** and optimize bottlenecks

## Troubleshooting

### Slow Builds
- Check cache hit rates in build logs
- Verify .dockerignore is excluding large files
- Use `--progress=plain` to see detailed timings
- Consider parallelizing independent stages

### Cache Misses
- Ensure consistent base image versions
- Check for unnecessary file changes triggering rebuilds
- Use cache mounts for package managers
- Verify registry cache is accessible

### Test Failures in Container
- Check environment variable differences
- Verify volume mounts are correct
- Ensure test dependencies are in test stage
- Check for hardcoded paths or ports