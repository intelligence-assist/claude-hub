# Workflow Migration Guide

## New Git Flow Strategy

We've migrated to a more efficient branching and CI/CD strategy:

```
feature/* → develop → main
         ↓         ↓       ↓
    PR checks  Full build  Deploy
     (fast)    & stage    to prod
```

## Workflow Changes

### 1. PR Checks (`pr-checks.yml`)
- **Triggers**: On all PRs
- **Duration**: ~2-3 minutes
- **Runs**:
  - Linting & formatting
  - Unit tests only
  - Security scans
  - Basic validation
- **No Docker builds** = Fast feedback

### 2. Develop Pipeline (`develop.yml`)
- **Triggers**: On push to `develop` branch
- **Duration**: ~10-15 minutes
- **Runs**:
  - Full test suite (unit, integration, E2E)
  - Docker builds (multi-platform)
  - Integration tests with real containers
  - Deploy to staging
- **Publishes**: `develop` and `develop-{sha}` tagged images

### 3. Main Deploy (`main-deploy.yml`)
- **Triggers**: On push to `main` branch
- **Duration**: ~2-3 minutes
- **Runs**:
  - Promotes existing images from develop
  - Quick smoke tests
  - Production deployment
  - Creates GitHub release
- **No rebuilds** = Fast, reliable deployments

### 4. Legacy CI (`ci.yml`)
- Now only runs on `develop` branch
- Provides additional testing coverage

## Branch Protection Rules

### Develop Branch
- Require PR reviews
- Require status checks: `pr-checks-complete`
- Dismiss stale reviews
- No direct pushes

### Main Branch
- Require PR from develop only
- Require administrators for direct push
- Require up-to-date with develop

## Migration Steps

1. Create `develop` branch from current `main`
2. Update default branch to `develop` in GitHub settings
3. Update branch protection rules
4. Update team workflow:
   - Feature branches → PR to develop
   - Develop tested in staging
   - Develop → PR to main for production

## Benefits

1. **Faster PR feedback**: 2-3 minutes vs 10-15 minutes
2. **No duplicate builds**: Images built once on develop
3. **Reliable deployments**: Only tested images reach production
4. **Better resource usage**: Heavy builds only on merge
5. **Clear staging/production separation**

## Disabled Workflows

The following workflows have been disabled:
- `docker-publish.yml` - Replaced by develop.yml
- `deploy.yml` - Replaced by main-deploy.yml

These can be found with `.disabled` extension if needed for reference.