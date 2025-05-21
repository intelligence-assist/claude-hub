# Claude GitHub Webhook

[![Jest Tests](https://img.shields.io/badge/tests-jest-green)](test/README.md)

A webhook service that enables Claude Code to respond to GitHub mentions and execute commands within repository contexts. This microservice allows Claude to analyze code, answer questions, and optionally make changes when mentioned in GitHub comments.

## Documentation

For comprehensive documentation, see:
- [Complete Workflow Guide](./docs/complete-workflow.md) - Full technical workflow documentation
- [GitHub Integration](./docs/github-workflow.md) - GitHub-specific features and setup
- [Container Setup](./docs/container-setup.md) - Docker container configuration
- [Container Limitations](./docs/container-limitations.md) - Known constraints and workarounds
- [AWS Authentication Best Practices](./docs/aws-authentication-best-practices.md) - Secure AWS credential management
- [Scripts Documentation](./SCRIPTS.md) - Organized scripts and their usage

## Use Cases

- Trigger Claude when mentioned in GitHub comments with your configured bot username
- Allow Claude to research repository code and answer questions
- Direct API access for Claude without GitHub webhook requirements
- Stateless container execution mode for isolation and scalability
- Optionally permit Claude to make code changes when requested

## Setup Guide

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- GitHub account with access to the repositories you want to use

### Step-by-Step Installation

1. **Clone this repository**
   ```
   git clone https://github.com/yourusername/claude-github-webhook.git
   cd claude-github-webhook
   ```

2. **Run the setup script**
   ```
   ./scripts/setup/setup.sh
   ```
   This will create necessary directories, copy the environment template, install dependencies, and set up pre-commit hooks for credential scanning.

3. **Configure Credentials**

   Copy the `.env.example` file to `.env` and edit with your credentials:
   ```
   cp .env.example .env
   nano .env  # or use your preferred editor
   ```

   **a. GitHub Webhook Secret**
   - Generate a secure random string to use as your webhook secret
   - You can use this command to generate one:
     ```
     node -e "console.log(require('crypto').randomBytes(20).toString('hex'))"
     ```
   - Save this value in your `.env` file as `GITHUB_WEBHOOK_SECRET`
   - You'll use this same value when setting up the webhook in GitHub

   **b. GitHub Personal Access Token**
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Click "Generate new token"
   - Name your token (e.g., "Claude GitHub Webhook")
   - Set the expiration as needed
   - Select the repositories you want Claude to access
   - Under "Repository permissions":
     - Issues: Read and write (to post comments)
     - Contents: Read (to read repository code)
   - Click "Generate token"
   - Copy the generated token to your `.env` file as `GITHUB_TOKEN`

   **c. AWS Credentials (for Claude via Bedrock)**
   - You need AWS Bedrock credentials to access Claude
   - Update the following values in your `.env` file:
     ```
     AWS_ACCESS_KEY_ID=your_aws_access_key
     AWS_SECRET_ACCESS_KEY=your_aws_secret_key
     AWS_REGION=us-east-1
     CLAUDE_CODE_USE_BEDROCK=1
     ANTHROPIC_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
     ```
   - Note: You don't need a Claude/Anthropic API key when using Bedrock

   **d. Bot Configuration**
   - Set the `BOT_USERNAME` environment variable in your `.env` file to the GitHub mention you want to use
   - This setting is required to prevent infinite loops
   - Example: `BOT_USERNAME=@MyBot`
   - No default is provided - this must be explicitly configured
   - Set `BOT_EMAIL` for the email address used in git commits made by the bot
   - Set `DEFAULT_AUTHORIZED_USER` to specify the default GitHub username authorized to use the bot
   - Use `AUTHORIZED_USERS` for a comma-separated list of GitHub usernames allowed to use the bot
   - Set `MAX_COMMENTS` to specify the number of recent comments to include in Claude's context (default: 5)

   **e. Server Port and Other Settings**
   - By default, the server runs on port 3000
   - To use a different port, set the `PORT` environment variable in your `.env` file
   - Set `DEFAULT_GITHUB_OWNER` and `DEFAULT_GITHUB_USER` for CLI defaults when using the webhook CLI
   - Set `TEST_REPO_FULL_NAME` to configure the default repository for test scripts
   - Review other settings in the `.env` file for customization options

   **AWS Credentials**: The service now supports multiple AWS authentication methods:
   - **Instance Profiles** (EC2): Automatically uses instance metadata
   - **Task Roles** (ECS): Automatically uses container credentials
   - **Temporary Credentials**: Set `AWS_SESSION_TOKEN` for STS credentials
   - **Static Credentials**: Fall back to `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
   
   For migration from static credentials, run:
   ```
   ./scripts/aws/migrate-aws-credentials.sh
   ```

4. **Start the server**
   ```
   npm start
   ```
   For development with auto-restart:
   ```
   npm run dev
   ```

### GitHub Webhook Configuration

1. **Go to your GitHub repository**
2. **Navigate to Settings → Webhooks**
3. **Click "Add webhook"**
4. **Configure the webhook:**
   - Payload URL: `https://claude.jonathanflatt.org/api/webhooks/github`
   - Content type: `application/json`
   - Secret: The same value you set for `GITHUB_WEBHOOK_SECRET` in your `.env` file
   - Events: Select "Send me everything" if you want to handle multiple event types, or choose specific events
   - Active: Check this box to enable the webhook
5. **Click "Add webhook"**

### Testing Your Setup

1. **Verify the webhook is receiving events**
   - After setting up the webhook, GitHub will send a ping event
   - Check your server logs to confirm it's receiving events

2. **Test with a sample comment**
   - Create a new issue or pull request in your repository
   - Add a comment mentioning your configured bot username followed by a question, like:
     ```
     @MyBot What does this repository do?
     ```
     (Replace @MyBot with your configured BOT_USERNAME)
   - Claude should respond with a new comment in the thread

3. **Using the test utilities**
   - You can use the included test utility to verify your webhook setup:
     ```
     node test-outgoing-webhook.js
     ```
   - This will start a test server and provide instructions for testing

   - To test the direct Claude API:
     ```
     node test-claude-api.js owner/repo
     ```
   - To test the container-based execution:
     ```
     ./scripts/build/build.sh claudecode  # First build the container
     node test-claude-api.js owner/repo container "Your command here"
     ```

## Troubleshooting

See the [Complete Workflow Guide](./docs/complete-workflow.md#troubleshooting) for detailed troubleshooting information.

### Quick Checks
- Verify webhook signature matches
- Check Docker daemon is running
- Confirm AWS/Bedrock credentials are valid
- Ensure GitHub token has correct permissions

## Security: Pre-commit Hooks

This project includes pre-commit hooks that automatically scan for credentials and secrets before commits. This helps prevent accidental exposure of sensitive information.

### Features

- **Credential Detection**: Scans for AWS keys, GitHub tokens, API keys, and other secrets
- **Multiple Scanners**: Uses both `detect-secrets` and `gitleaks` for comprehensive coverage
- **Code Quality**: Also includes hooks for trailing whitespace, JSON/YAML validation, and more

### Usage

Pre-commit hooks are automatically installed when you run `./scripts/setup/setup.sh`. They run automatically on every commit.

To manually run the hooks:
```bash
pre-commit run --all-files
```

For more information, see [pre-commit setup documentation](./docs/pre-commit-setup.md).

## Direct Claude API

The server provides a direct API endpoint for Claude that doesn't rely on GitHub webhooks. This allows you to integrate Claude with other systems or test Claude's responses.

### API Endpoint

```
POST /api/claude
```

### Request Body

| Parameter | Type | Description |
|-----------|------|-------------|
| repoFullName | string | The repository name in the format "owner/repo" |
| command | string | The command or question to send to Claude |
| authToken | string | Optional authentication token (required if CLAUDE_API_AUTH_REQUIRED=1) |
| useContainer | boolean | Whether to use container-based execution (optional, defaults to false) |

### Example Request

```json
{
  "repoFullName": "owner/repo",
  "command": "Explain what this repository does",
  "authToken": "your-auth-token",
  "useContainer": true
}
```

### Example Response

```json
{
  "message": "Command processed successfully",
  "response": "This repository is a webhook server that integrates Claude with GitHub..."
}
```

### Authentication

To secure the API, you can enable authentication by setting the following environment variables:

```
CLAUDE_API_AUTH_REQUIRED=1
CLAUDE_API_AUTH_TOKEN=your-secret-token
```

### Container-Based Execution

The container-based execution mode provides isolation and better scalability. When enabled, each request will:

1. Launch a new Docker container with Claude Code CLI
2. Clone the repository inside the container (or use cached repository)
3. Analyze the repository structure and content
4. Generate a helpful response based on the analysis
5. Clean up resources

> Note: Due to technical limitations with running Claude in containers, the current implementation uses automatic repository analysis instead of direct Claude execution. See [Container Limitations](./docs/container-limitations.md) for details.

To enable container-based execution:

1. Build the Claude container:
   ```
   ./scripts/build/build.sh claude
   ```

2. Set the environment variables:
   ```
   CLAUDE_USE_CONTAINERS=1
   CLAUDE_CONTAINER_IMAGE=claudecode:latest
   REPO_CACHE_DIR=/path/to/cache  # Optional
   REPO_CACHE_MAX_AGE_MS=3600000  # Optional, defaults to 1 hour (in milliseconds)
   CONTAINER_LIFETIME_MS=7200000  # Optional, container execution timeout in milliseconds (defaults to 2 hours)
   ```

### Container Test Utility

A dedicated test script is provided for testing container execution directly:

```bash
./test/container/test-container.sh
```

This utility will:
1. Force container mode
2. Execute the command in a container
3. Display the Claude response
4. Show execution timing information

### Repository Caching

The container mode includes an intelligent repository caching mechanism:

- Repositories are cached to improve performance for repeated queries
- Cache is automatically refreshed after the configured expiration time
- You can configure the cache location and max age via environment variables:
  ```
  REPO_CACHE_DIR=/path/to/cache
  REPO_CACHE_MAX_AGE_MS=3600000  # 1 hour in milliseconds
  ```

For detailed information about container mode setup and usage, see [Container Setup Documentation](./docs/container-setup.md).

## Development

To run the server in development mode with auto-restart:

```
npm run dev
```

## Testing

Run tests with:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests with coverage report
npm run test:coverage
```

See [Test Documentation](test/README.md) for more details on the testing framework.