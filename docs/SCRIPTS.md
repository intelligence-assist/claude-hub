# Claude GitHub Webhook Scripts

This document provides an overview of the scripts in this repository, organized by category and purpose.

## Setup and Installation

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/setup/setup.sh` | Main setup script for the project | `./scripts/setup/setup.sh` |
| `scripts/setup/setup-precommit.sh` | Sets up pre-commit hooks | `./scripts/setup/setup-precommit.sh` |
| `scripts/setup/setup-claude-auth.sh` | Sets up Claude authentication | `./scripts/setup/setup-claude-auth.sh` |
| `scripts/setup/setup-secure-credentials.sh` | Sets up secure credentials | `./scripts/setup/setup-secure-credentials.sh` |

## Build Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/build/build.sh` | Builds the Docker images | `./scripts/build/build.sh` |

## AWS Configuration and Credentials

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/aws/create-aws-profile.sh` | Creates AWS profiles programmatically | `./scripts/aws/create-aws-profile.sh <profile-name> <access-key-id> <secret-access-key> [region] [output-format]` |
| `scripts/aws/setup-aws-profiles.sh` | Sets up AWS profiles | `./scripts/aws/setup-aws-profiles.sh` |

## Runtime and Execution

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/runtime/start-api.sh` | Starts the API server | `./scripts/runtime/start-api.sh` |
| `scripts/runtime/entrypoint.sh` | Container entrypoint script | Used automatically by Docker |
| `scripts/runtime/claudecode-entrypoint.sh` | Claude Code container entrypoint | Used automatically by Docker |
| `scripts/runtime/startup.sh` | Startup script | `./scripts/runtime/startup.sh` |
| `scripts/runtime/claude-wrapper.sh` | Wrapper for Claude CLI | `./scripts/runtime/claude-wrapper.sh [args]` |

## Network and Security

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/security/init-firewall.sh` | Initializes firewall for containers | `./scripts/security/init-firewall.sh` |
| `scripts/security/accept-permissions.sh` | Handles permission acceptance | `./scripts/security/accept-permissions.sh` |
| `scripts/security/credential-audit.sh` | Audits code for credential leaks | `./scripts/security/credential-audit.sh` |

## Utility Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/utils/ensure-test-dirs.sh` | Ensures test directories exist | `./scripts/utils/ensure-test-dirs.sh` |
| `scripts/utils/setup-repository-labels.js` | Sets up GitHub repository labels | `node scripts/utils/setup-repository-labels.js owner/repo` |

## Testing

All shell-based test scripts have been migrated to JavaScript E2E tests using Jest. Use the following npm commands:

### JavaScript Test Files

**Note**: Shell-based test scripts have been migrated to JavaScript E2E tests using Jest. The following test files provide comprehensive testing:

| Test File | Description | Usage |
|--------|-------------|-------|
| `test/e2e/scenarios/container-execution.test.js` | Tests container functionality | `npm run test:e2e` |
| `test/e2e/scenarios/claude-integration.test.js` | Tests Claude integration | `npm run test:e2e` |
| `test/e2e/scenarios/docker-execution.test.js` | Tests Docker execution | `npm run test:e2e` |
| `test/e2e/scenarios/security-firewall.test.js` | Tests security and firewall | `npm run test:e2e` |

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Common Workflows

### Setting Up for the First Time

```bash
# Set up the project
./scripts/setup/setup.sh

# Set up Claude authentication
./scripts/setup/setup-claude-auth.sh

# Set up secure credentials
./scripts/setup/setup-secure-credentials.sh

# Create AWS profile
./scripts/aws/create-aws-profile.sh claude-webhook YOUR_ACCESS_KEY YOUR_SECRET_KEY
```

### Building and Running

```bash
# Build Docker images
./scripts/build/build.sh

# Start the API server
./scripts/runtime/start-api.sh

# Or use Docker Compose
docker compose up -d
```

### Running Tests

```bash
# Run all tests
npm test

# Run E2E tests specifically
npm run test:e2e

# Run unit tests specifically
npm run test:unit
```

## Notes

- All shell-based test scripts have been migrated to JavaScript E2E tests for better maintainability and consistency.
- The project uses npm scripts for most common operations. See `package.json` for available scripts.
- Docker Compose is the recommended way to run the service in production.