# Test Migration Notice

## Shell Scripts Migrated to Jest E2E Tests

The following shell test scripts have been migrated to the Jest E2E test suite and have been removed:

### Migrated Shell Scripts (✅ Completed)

**AWS Tests** (Directory: `test/aws/` - removed)
- `test-aws-mount.sh` → `test/e2e/scenarios/aws-authentication.test.js`
- `test-aws-profile.sh` → `test/e2e/scenarios/aws-authentication.test.js`

**Claude Tests** (Directory: `test/claude/` - removed)
- `test-claude-direct.sh` → `test/e2e/scenarios/claude-integration.test.js`
- `test-claude-installation.sh` → `test/e2e/scenarios/claude-integration.test.js`
- `test-claude-no-firewall.sh` → `test/e2e/scenarios/claude-integration.test.js`
- `test-claude-response.sh` → `test/e2e/scenarios/claude-integration.test.js`

**Container Tests** (Directory: `test/container/` - removed)
- `test-basic-container.sh` → `test/e2e/scenarios/container-execution.test.js`
- `test-container-cleanup.sh` → `test/e2e/scenarios/container-execution.test.js`
- `test-container-privileged.sh` → `test/e2e/scenarios/container-execution.test.js`

**Security Tests** (Directory: `test/security/` - removed)
- `test-firewall.sh` → `test/e2e/scenarios/security-firewall.test.js`
- `test-github-token.sh` → `test/e2e/scenarios/github-integration.test.js`
- `test-with-auth.sh` → `test/e2e/scenarios/security-firewall.test.js`

**Integration Tests** (Directory: `test/integration/` - removed)
- `test-full-flow.sh` → `test/e2e/scenarios/full-workflow.test.js`
- `test-claudecode-docker.sh` → `test/e2e/scenarios/docker-execution.test.js` and `full-workflow.test.js`

### Retained Shell Scripts

The following scripts contain unique functionality not yet migrated:

- `test/claude/test-claude.sh` - Contains specific Claude CLI testing logic
- `test/container/test-container.sh` - Contains container validation logic

## Running the New E2E Tests

To run the migrated E2E tests:

```bash
# Run all E2E tests
npm run test:e2e

# Run specific scenario
npx jest test/e2e/scenarios/aws-authentication.test.js
```

## CI/CD Considerations

The E2E tests require:

- Docker daemon access
- `claude-code-runner:latest` Docker image
- Optional: Real GitHub token for full GitHub API tests
- Optional: AWS credentials for full AWS tests

Most tests will run with mock credentials, but some functionality will be skipped.
