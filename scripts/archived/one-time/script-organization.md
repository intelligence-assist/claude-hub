# Script Organization Proposal

## Categories of Scripts

### 1. Setup and Installation
- `scripts/setup.sh` - Main setup script for the project
- `scripts/setup-precommit.sh` - Sets up pre-commit hooks
- `setup-claude-auth.sh` - Sets up Claude authentication
- `setup-new-repo.sh` - Sets up a new clean repository
- `create-new-repo.sh` - Creates a new repository

### 2. Build Scripts
- `build-claude-container.sh` - Builds the Claude container
- `build-claudecode.sh` - Builds the Claude Code runner Docker image
- `update-production-image.sh` - Updates the production Docker image

### 3. AWS Configuration and Credentials
- `scripts/create-aws-profile.sh` - Creates AWS profiles programmatically
- `scripts/migrate-aws-credentials.sh` - Migrates AWS credentials
- `scripts/setup-aws-profiles.sh` - Sets up AWS profiles
- `update-aws-creds.sh` - Updates AWS credentials

### 4. Runtime and Execution
- `start-api.sh` - Starts the API server
- `entrypoint.sh` - Container entrypoint script
- `claudecode-entrypoint.sh` - Claude Code container entrypoint
- `startup.sh` - Startup script
- `claude-wrapper.sh` - Wrapper for Claude CLI

### 5. Network and Security
- `init-firewall.sh` - Initializes firewall for containers
- `accept-permissions.sh` - Handles permission acceptance
- `fix-credential-references.sh` - Fixes credential references

### 6. Testing
- `test/test-full-flow.sh` - Tests the full workflow
- `test/test-claudecode-docker.sh` - Tests Claude Code Docker setup
- `test/test-github-token.sh` - Tests GitHub token
- `test/test-aws-profile.sh` - Tests AWS profile
- `test/test-basic-container.sh` - Tests basic container functionality
- `test/test-claude-direct.sh` - Tests direct Claude integration
- `test/test-firewall.sh` - Tests firewall configuration
- `test/test-direct-claude.sh` - Tests direct Claude access
- `test/test-claude-no-firewall.sh` - Tests Claude without firewall
- `test/test-claude-installation.sh` - Tests Claude installation
- `test/test-aws-mount.sh` - Tests AWS mount functionality
- `test/test-claude-version.sh` - Tests Claude version
- `test/test-container-cleanup.sh` - Tests container cleanup
- `test/test-claude-response.sh` - Tests Claude response
- `test/test-container-privileged.sh` - Tests container privileged mode
- `test/test-with-auth.sh` - Tests with authentication

### 7. Utility Scripts
- `scripts/ensure-test-dirs.sh` - Ensures test directories exist
- `prepare-clean-repo.sh` - Prepares a clean repository
- `volume-test.sh` - Tests volume mounting

## Proposed Directory Structure

```
/claude-repo
├── scripts/
│   ├── setup/
│   │   ├── setup.sh
│   │   ├── setup-precommit.sh
│   │   ├── setup-claude-auth.sh
│   │   ├── setup-new-repo.sh
│   │   └── create-new-repo.sh
│   ├── build/
│   │   ├── build-claude-container.sh
│   │   ├── build-claudecode.sh
│   │   └── update-production-image.sh
│   ├── aws/
│   │   ├── create-aws-profile.sh
│   │   ├── migrate-aws-credentials.sh
│   │   ├── setup-aws-profiles.sh
│   │   └── update-aws-creds.sh
│   ├── runtime/
│   │   ├── start-api.sh
│   │   ├── entrypoint.sh
│   │   ├── claudecode-entrypoint.sh
│   │   ├── startup.sh
│   │   └── claude-wrapper.sh
│   ├── security/
│   │   ├── init-firewall.sh
│   │   ├── accept-permissions.sh
│   │   └── fix-credential-references.sh
│   └── utils/
│       ├── ensure-test-dirs.sh
│       ├── prepare-clean-repo.sh
│       └── volume-test.sh
├── test/
│   ├── integration/
│   │   ├── test-full-flow.sh
│   │   ├── test-claudecode-docker.sh
│   │   └── ...
│   ├── aws/
│   │   ├── test-aws-profile.sh
│   │   ├── test-aws-mount.sh
│   │   └── ...
│   ├── container/
│   │   ├── test-basic-container.sh
│   │   ├── test-container-cleanup.sh
│   │   ├── test-container-privileged.sh
│   │   └── ...
│   ├── claude/
│   │   ├── test-claude-direct.sh
│   │   ├── test-claude-no-firewall.sh
│   │   ├── test-claude-installation.sh
│   │   ├── test-claude-version.sh
│   │   ├── test-claude-response.sh
│   │   └── ...
│   ├── security/
│   │   ├── test-firewall.sh
│   │   ├── test-with-auth.sh
│   │   └── test-github-token.sh
│   └── utils/
│       └── ...
└── ...
```

## Implementation Plan

1. Create the new directory structure
2. Move scripts to their appropriate categories
3. Update references in scripts to point to new locations
4. Update documentation to reflect new organization
5. Create wrapper scripts if needed to maintain backward compatibility