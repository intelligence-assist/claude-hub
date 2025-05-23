# Docker CI/CD Pipeline

This document describes the automated Docker build and publish pipeline for the Claude GitHub Webhook.

## Overview

The pipeline automatically builds and publishes Docker images to Docker Hub based on Git events:

- **Push to main/master**: Builds and tags as `staging`
- **Git tags (v*.*.*)**: Builds and tags with version numbers and `latest`
- **Pull requests**: Builds but doesn't push (for testing)

## Workflow Triggers

### Branch Pushes (Staging)
When you push to `main` or `master`:
- Image tagged as: `main-staging` or `master-staging`
- Also tagged with commit SHA: `main-abc1234`

### Version Tags (Releases)
When you create a semantic version tag (e.g., `v1.2.3`):
- Image tagged as: `1.2.3`, `1.2`, `1`, and `latest`
- Also tagged with commit SHA

### Pull Requests
- Builds the image but doesn't push
- Allows testing of Dockerfile changes

## Setup Requirements

1. **Docker Hub Token**: Create a Docker Hub access token
   - Go to Docker Hub → Account Settings → Security → Access Tokens
   - Create a new token with `Read, Write, Delete` permissions
   - Add as GitHub secret: `DOCKER_HUB_TOKEN`

2. **GitHub Repository Secrets**:
   ```
   DOCKER_HUB_TOKEN: Your Docker Hub access token
   ```

## Image Tags

### Main Repository (`intelligenceassist/claude-github-webhook`)
- `latest`: Latest stable release
- `X.Y.Z`: Specific version
- `main-staging`: Latest from main branch
- `main-sha-abc1234`: Specific commit

### Claude Code Container (`intelligenceassist/claudecode`)
- `latest`: Latest stable release
- `X.Y.Z`: Specific version
- `main-staging`: Latest from main branch

## Creating a Release

1. **Test on staging**:
   ```bash
   git checkout main
   git pull origin main
   # Make your changes
   git add .
   git commit -m "feat: your feature"
   git push origin main
   ```
   This triggers a staging build.

2. **Create a release**:
   ```bash
   # After testing staging
   git tag v0.2.0
   git push origin v0.2.0
   ```
   This triggers a release build with proper version tags.

## Multi-Platform Builds

The workflow builds for multiple platforms:
- `linux/amd64`: Standard x86_64 architecture
- `linux/arm64`: ARM64 (for Apple Silicon, AWS Graviton, etc.)

## Caching

The workflow uses GitHub Actions cache to speed up builds:
- Docker layers are cached between builds
- Cache is stored in GitHub Actions cache storage

## Monitoring Builds

1. **GitHub Actions**: Check the Actions tab in your repository
2. **Docker Hub**: View pushed tags at https://hub.docker.com/r/intelligenceassist/claude-github-webhook/tags

## Best Practices

1. **Always test on staging first**: Push to main before creating a release tag
2. **Use semantic versioning**: Follow vX.Y.Z format for release tags
3. **Write descriptive commit messages**: They appear in Docker Hub
4. **Update README.dockerhub.md**: It auto-syncs to Docker Hub on main pushes

## Troubleshooting

### Build Failures
- Check GitHub Actions logs
- Ensure Dockerfile syntax is correct
- Verify all files referenced in Dockerfile exist

### Push Failures
- Verify `DOCKER_HUB_TOKEN` secret is set correctly
- Ensure token has write permissions
- Check Docker Hub quota limits

### Tag Issues
- Tags must start with 'v' for version detection (e.g., v1.0.0)
- Ensure no spaces or special characters in tag names