# Claude GitHub Webhook Scripts

This document provides an overview of the scripts in this repository, organized by category and purpose.

## Setup and Installation

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/setup/setup.sh` | Main setup script for the project | `./scripts/setup/setup.sh` |
| `scripts/setup/setup-precommit.sh` | Sets up pre-commit hooks | `./scripts/setup/setup-precommit.sh` |
| `scripts/setup/setup-claude-auth.sh` | Sets up Claude authentication | `./scripts/setup/setup-claude-auth.sh` |
| `scripts/setup/setup-new-repo.sh` | Sets up a new clean repository | `./scripts/setup/setup-new-repo.sh` |
| `scripts/setup/create-new-repo.sh` | Creates a new repository | `./scripts/setup/create-new-repo.sh` |

## Build Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/build/build-claude-container.sh` | Builds the Claude container | `./scripts/build/build-claude-container.sh` |
| `scripts/build/build-claudecode.sh` | Builds the Claude Code runner Docker image | `./scripts/build/build-claudecode.sh` |
| `scripts/build/update-production-image.sh` | Updates the production Docker image | `./scripts/build/update-production-image.sh` |

## AWS Configuration and Credentials

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/aws/create-aws-profile.sh` | Creates AWS profiles programmatically | `./scripts/aws/create-aws-profile.sh <profile-name> <access-key-id> <secret-access-key> [region] [output-format]` |
| `scripts/aws/migrate-aws-credentials.sh` | Migrates AWS credentials to profiles | `./scripts/aws/migrate-aws-credentials.sh` |
| `scripts/aws/setup-aws-profiles.sh` | Sets up AWS profiles | `./scripts/aws/setup-aws-profiles.sh` |
| `scripts/aws/update-aws-creds.sh` | Updates AWS credentials | `./scripts/aws/update-aws-creds.sh` |

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
| `scripts/security/fix-credential-references.sh` | Fixes credential references | `./scripts/security/fix-credential-references.sh` |

## Utility Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `scripts/utils/ensure-test-dirs.sh` | Ensures test directories exist | `./scripts/utils/ensure-test-dirs.sh` |
| `scripts/utils/prepare-clean-repo.sh` | Prepares a clean repository | `./scripts/utils/prepare-clean-repo.sh` |
| `scripts/utils/volume-test.sh` | Tests volume mounting | `./scripts/utils/volume-test.sh` |

## Testing Scripts

### Integration Tests

| Script | Description | Usage |
|--------|-------------|-------|
| `test/integration/test-full-flow.sh` | Tests the full workflow | `./test/integration/test-full-flow.sh` |
| `test/integration/test-claudecode-docker.sh` | Tests Claude Code Docker setup | `./test/integration/test-claudecode-docker.sh` |

### AWS Tests

| Script | Description | Usage |
|--------|-------------|-------|
| `test/aws/test-aws-profile.sh` | Tests AWS profile configuration | `./test/aws/test-aws-profile.sh` |
| `test/aws/test-aws-mount.sh` | Tests AWS mount functionality | `./test/aws/test-aws-mount.sh` |

### Container Tests

| Script | Description | Usage |
|--------|-------------|-------|
| `test/container/test-basic-container.sh` | Tests basic container functionality | `./test/container/test-basic-container.sh` |
| `test/container/test-container-cleanup.sh` | Tests container cleanup | `./test/container/test-container-cleanup.sh` |
| `test/container/test-container-privileged.sh` | Tests container privileged mode | `./test/container/test-container-privileged.sh` |

### Claude Tests

| Script | Description | Usage |
|--------|-------------|-------|
| `test/claude/test-claude-direct.sh` | Tests direct Claude integration | `./test/claude/test-claude-direct.sh` |
| `test/claude/test-claude-no-firewall.sh` | Tests Claude without firewall | `./test/claude/test-claude-no-firewall.sh` |
| `test/claude/test-claude-installation.sh` | Tests Claude installation | `./test/claude/test-claude-installation.sh` |
| `test/claude/test-claude-version.sh` | Tests Claude version | `./test/claude/test-claude-version.sh` |
| `test/claude/test-claude-response.sh` | Tests Claude response | `./test/claude/test-claude-response.sh` |
| `test/claude/test-direct-claude.sh` | Tests direct Claude access | `./test/claude/test-direct-claude.sh` |

### Security Tests

| Script | Description | Usage |
|--------|-------------|-------|
| `test/security/test-firewall.sh` | Tests firewall configuration | `./test/security/test-firewall.sh` |
| `test/security/test-with-auth.sh` | Tests with authentication | `./test/security/test-with-auth.sh` |
| `test/security/test-github-token.sh` | Tests GitHub token | `./test/security/test-github-token.sh` |

## Common Workflows

### Setting Up for the First Time

```bash
# Set up the project
./scripts/setup/setup.sh

# Set up Claude authentication
./scripts/setup/setup-claude-auth.sh

# Create AWS profile
./scripts/aws/create-aws-profile.sh claude-webhook YOUR_ACCESS_KEY YOUR_SECRET_KEY
```

### Building and Running

```bash
# Build Claude Code container
./scripts/build/build-claudecode.sh

# Start the API server
./scripts/runtime/start-api.sh

# Or use Docker Compose
docker compose up -d
```

### Running Tests

```bash
# Run integration tests
./test/integration/test-full-flow.sh

# Run AWS tests
./test/aws/test-aws-profile.sh

# Run Claude tests
./test/claude/test-claude-direct.sh
```

## Backward Compatibility

For backward compatibility, wrapper scripts are provided in the root directory for the most commonly used scripts:

- `setup-claude-auth.sh` -> `scripts/setup/setup-claude-auth.sh`
- `build-claudecode.sh` -> `scripts/build/build-claudecode.sh`
- `start-api.sh` -> `scripts/runtime/start-api.sh`

These wrappers simply forward all arguments to the actual scripts in their new locations.