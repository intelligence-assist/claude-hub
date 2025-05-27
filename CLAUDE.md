# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude GitHub Webhook

This repository contains a webhook service that integrates Claude with GitHub, allowing Claude to respond to mentions in GitHub comments and help with repository tasks. When someone mentions the configured bot username (configured via environment variables) in a GitHub issue or PR comment, the system processes the command with Claude Code and returns a helpful response.

## Documentation Structure

- `/docs/complete-workflow.md` - Comprehensive workflow documentation
- `/docs/github-workflow.md` - GitHub-specific integration details
- `/docs/container-setup.md` - Docker container configuration
- `/docs/container-limitations.md` - Container execution constraints
- `/docs/aws-authentication-best-practices.md` - AWS credential management
- `/docs/aws-profile-quickstart.md` - Quick setup for AWS profiles
- `/docs/aws-profile-setup.md` - Detailed AWS profile configuration

## Build & Run Commands

### Setup and Installation
- **Initial setup**: `./scripts/setup.sh`
- **Setup secure credentials**: `./scripts/setup/setup-secure-credentials.sh`
- **Start with Docker (recommended)**: `docker compose up -d`
- **Start the server locally**: `npm start`
- **Development mode with auto-restart**: `npm run dev`
- **Start on specific port**: `./scripts/runtime/start-api.sh` (uses port 3003)
- **Run tests**: `npm test`
- Run specific test types:
  - Unit tests: `npm run test:unit`
  - End-to-end tests: `npm run test:e2e`
  - Test with coverage: `npm run test:coverage`
  - Watch mode: `npm run test:watch`

### Docker Commands
- **Start services**: `docker compose up -d` (uses secure credentials)
- **Stop services**: `docker compose down`
- **View logs**: `docker compose logs -f webhook`
- **Restart**: `docker compose restart webhook`
- Build Claude container: `./build-claude-container.sh`
- Build Claude Code container: `./scripts/build/build-claudecode.sh`
- Update production image: `./update-production-image.sh`

### AWS Credential Management
- Create AWS profile: `./scripts/create-aws-profile.sh`
- Migrate from static credentials: `./scripts/migrate-aws-credentials.sh`
- Setup AWS profiles: `./scripts/setup-aws-profiles.sh`
- Setup Claude authentication: `./scripts/setup/setup-claude-auth.sh`

### Testing Utilities
- Test Claude API directly: `node test/test-claude-api.js owner/repo`
- Test with container execution: `node test/test-claude-api.js owner/repo container "Your command here"`
- Test outgoing webhook: `node test/test-outgoing-webhook.js`
- Test pre-commit hooks: `pre-commit run --all-files`
- Test AWS credential provider: `node test/test-aws-credential-provider.js`
- Test Claude container: `./test/test-claudecode-docker.sh`
- Test full workflow: `./test/test-full-flow.sh`

### CI/CD Commands
- Run linting: `npm run lint` (auto-fix) or `npm run lint:check` (check only)
- Run formatting: `npm run format` (auto-fix) or `npm run format:check` (check only)
- Run security audit: `npm run security:audit`
- Fix security vulnerabilities: `npm run security:fix`
- All CI tests: `npm run test:ci` (includes coverage)

### End-to-End Testing
Use the demo repository for testing auto-tagging and webhook functionality:
- Demo repository: `https://github.com/intelligence-assist/demo-repository`
- Test auto-tagging: `./cli/webhook-cli.js --repo "intelligence-assist/demo-repository" --command "Auto-tag this issue" --issue 1 --url "http://localhost:8082"`
- Test with specific issue content: Create a new issue in the demo repository to trigger auto-tagging webhook
- Verify labels are applied based on issue content analysis

### Label Management
- Setup repository labels: `GITHUB_TOKEN=your_token node scripts/utils/setup-repository-labels.js owner/repo`

### CLI Commands
- Basic usage: `./cli/claude-webhook myrepo "Your command for Claude"`
- With explicit owner: `./cli/claude-webhook owner/repo "Your command for Claude"`
- Pull request review: `./cli/claude-webhook myrepo "Review this PR" -p -b feature-branch`
- Specific issue: `./cli/claude-webhook myrepo "Fix issue" -i 42`
- Advanced usage: `node cli/webhook-cli.js --repo myrepo --command "Your command" --verbose`
- Secure mode: `node cli/webhook-cli-secure.js` (uses AWS profile authentication)

## Features

### Auto-Tagging
The system automatically analyzes new issues and applies appropriate labels using a secure, minimal-permission approach:

**Security Features:**
- **Minimal Tool Access**: Uses only `Read` and `GitHub` tools (no file editing or bash execution)
- **Dedicated Container**: Runs in specialized container with restricted entrypoint script
- **CLI-Based**: Uses `gh` CLI commands directly instead of JSON parsing for better reliability

**Label Categories:**
- **Priority**: critical, high, medium, low
- **Type**: bug, feature, enhancement, documentation, question, security  
- **Complexity**: trivial, simple, moderate, complex
- **Component**: api, frontend, backend, database, auth, webhook, docker

**Process Flow:**
1. New issue triggers `issues.opened` webhook
2. Dedicated Claude container starts with `claudecode-tagging-entrypoint.sh`
3. Claude analyzes issue content using minimal tools
4. Labels applied directly via `gh issue edit --add-label` commands
5. No comments posted (silent operation)
6. Fallback to keyword-based labeling if CLI approach fails

### Automated PR Review
The system automatically triggers comprehensive PR reviews when all checks pass:
- **Trigger**: `check_suite` webhook event with `conclusion: 'success'`
- **Scope**: Reviews all PRs associated with the successful check suite
- **Process**: Claude performs security, logic, performance, and code quality analysis
- **Output**: Detailed review comments, line-specific feedback, and approval/change requests
- **Integration**: Uses GitHub CLI (`gh`) commands for seamless review workflow

## Architecture Overview

### Core Components
1. **Express Server** (`src/index.js`): Main application entry point that sets up middleware, routes, and error handling
2. **Routes**:
   - GitHub Webhook: `/api/webhooks/github` - Processes GitHub webhook events
   - Claude API: `/api/claude` - Direct API access to Claude
   - Health Check: `/health` - Service status monitoring
3. **Controllers**:
   - `githubController.js` - Handles webhook verification and processing
4. **Services**:
   - `claudeService.js` - Interfaces with Claude Code CLI
   - `githubService.js` - Handles GitHub API interactions
5. **Utilities**:
   - `logger.js` - Logging functionality with redaction capability
   - `awsCredentialProvider.js` - Secure AWS credential management
   - `sanitize.js` - Input sanitization and security

### Execution Modes & Security Architecture
The system uses different execution modes based on operation type:

**Operation Types:**
- **Auto-tagging**: Minimal permissions (`Read`, `GitHub` tools only)
- **PR Review**: Standard permissions (full tool set)
- **Default**: Standard permissions (full tool set)

**Security Features:**
- **Tool Allowlists**: Each operation type uses specific tool restrictions
- **Dedicated Entrypoints**: Separate container entrypoint scripts for different operations
- **No Dangerous Permissions**: System avoids `--dangerously-skip-permissions` flag
- **Container Isolation**: Docker containers with minimal required capabilities

**Container Entrypoints:**
- `claudecode-tagging-entrypoint.sh`: Minimal tools for auto-tagging (`--allowedTools Read,GitHub`)
- `claudecode-entrypoint.sh`: Full tools for general operations (`--allowedTools Bash,Create,Edit,Read,Write,GitHub`)

**DevContainer Configuration:**
The repository includes a `.devcontainer` configuration for development:
- Privileged mode for system-level access
- Network capabilities (NET_ADMIN, NET_RAW) for firewall management
- System capabilities (SYS_TIME, DAC_OVERRIDE, AUDIT_WRITE, SYS_ADMIN)
- Docker socket mounting for container management
- Automatic firewall initialization via post-create command

### Workflow
1. GitHub comment with bot mention (configured via BOT_USERNAME) triggers a webhook event
2. Express server receives the webhook at `/api/webhooks/github`
3. Service extracts the command and processes it with Claude in a Docker container
4. Claude analyzes the repository and responds to the command
5. Response is returned via the webhook HTTP response

## AWS Authentication
The service supports multiple AWS authentication methods, with a focus on security:
- **Profile-based authentication**: Uses AWS profiles from `~/.aws/credentials`
- **Instance Profiles** (EC2): Automatically uses instance metadata
- **Task Roles** (ECS): Automatically uses container credentials
- **Direct credentials**: Not recommended, but supported for backward compatibility

The `awsCredentialProvider.js` utility handles credential retrieval and rotation.

## Security Features
- Webhook signature verification using HMAC
- Credential scanning in pre-commit hooks
- Container isolation for Claude execution
- AWS profile-based authentication
- Input sanitization and validation
- Docker capability restrictions
- Firewall initialization for container networking

## Configuration
- Environment variables are loaded from `.env` file
- AWS Bedrock credentials for Claude access
- GitHub tokens and webhook secrets
- Container execution settings
- Webhook URL and port configuration

### Required Environment Variables
- `BOT_USERNAME`: GitHub username that the bot responds to (e.g., `@ClaudeBot`)
- `DEFAULT_AUTHORIZED_USER`: Default GitHub username authorized to use the bot (if AUTHORIZED_USERS is not set)
- `AUTHORIZED_USERS`: Comma-separated list of GitHub usernames authorized to use the bot
- `BOT_EMAIL`: Email address used for git commits made by the bot
- `GITHUB_WEBHOOK_SECRET`: Secret for validating GitHub webhook payloads
- `GITHUB_TOKEN`: GitHub token for API access
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude access

### Optional Environment Variables
- `PR_REVIEW_WAIT_FOR_ALL_CHECKS`: Set to `"true"` to wait for all meaningful check suites to complete successfully before triggering PR review (default: `"true"`). Uses smart logic to handle conditional jobs and skipped checks, preventing duplicate reviews from different check suites.
- `PR_REVIEW_TRIGGER_WORKFLOW`: Name of a specific GitHub Actions workflow that should trigger PR reviews (e.g., `"Pull Request CI"`). Only used if `PR_REVIEW_WAIT_FOR_ALL_CHECKS` is `"false"`.
- `PR_REVIEW_DEBOUNCE_MS`: Delay in milliseconds before checking all check suites status (default: `"5000"`). This accounts for GitHub's eventual consistency.
- `PR_REVIEW_MAX_WAIT_MS`: Maximum time to wait for stale in-progress check suites before considering them failed (default: `"1800000"` = 30 minutes).
- `PR_REVIEW_CONDITIONAL_TIMEOUT_MS`: Time to wait for conditional jobs that never start before skipping them (default: `"300000"` = 5 minutes).

## Code Style Guidelines
- JavaScript with Node.js
- Use async/await for asynchronous operations
- Comprehensive error handling and logging
- camelCase variable and function naming
- Input validation and sanitization for security