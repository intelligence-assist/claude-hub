# Test Migration Notice

## Shell Scripts Migrated to Jest E2E Tests

The following shell test scripts have been migrated to the Jest E2E test suite and can be safely removed:

### AWS Tests
- `test/aws/test-aws-mount.sh` → Replaced by `test/e2e/scenarios/aws-authentication.test.js`
- `test/aws/test-aws-profile.sh` → Replaced by `test/e2e/scenarios/aws-authentication.test.js`

### Claude Tests
- `test/claude/test-claude-direct.sh` → Replaced by `test/e2e/scenarios/claude-integration.test.js`
- `test/claude/test-claude-installation.sh` → Replaced by `test/e2e/scenarios/claude-integration.test.js`
- `test/claude/test-claude-no-firewall.sh` → Replaced by `test/e2e/scenarios/claude-integration.test.js`
- `test/claude/test-claude-response.sh` → Replaced by `test/e2e/scenarios/claude-integration.test.js`

### Container Tests
- `test/container/test-basic-container.sh` → Replaced by `test/e2e/scenarios/container-execution.test.js`
- `test/container/test-container-cleanup.sh` → Replaced by `test/e2e/scenarios/container-execution.test.js`
- `test/container/test-container-privileged.sh` → Replaced by `test/e2e/scenarios/container-execution.test.js`

### Security Tests
- `test/security/test-firewall.sh` → Replaced by `test/e2e/scenarios/security-firewall.test.js`
- `test/security/test-github-token.sh` → Replaced by `test/e2e/scenarios/github-integration.test.js`
- `test/security/test-with-auth.sh` → Replaced by `test/e2e/scenarios/security-firewall.test.js`

### Integration Tests
- `test/integration/test-full-flow.sh` → Replaced by `test/e2e/scenarios/full-workflow.test.js`
- `test/integration/test-claudecode-docker.sh` → Replaced by `test/e2e/scenarios/docker-execution.test.js` and `full-workflow.test.js`

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