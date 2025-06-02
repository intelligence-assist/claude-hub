# Claude Hub CLI

The Claude Hub CLI provides two main interfaces:

1. **claude-webhook**: Interact with the Claude GitHub webhook service
2. **claude-hub**: Manage autonomous Claude Code container sessions

## Claude Webhook CLI

A command-line interface to interact with the Claude GitHub webhook service.

### Installation

1. Ensure you have Node.js installed
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

Create a `.env` file in the root directory with:

```env
API_URL=https://claude.jonathanflatt.org
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-token
```

### Usage

#### Basic Usage

```bash
# Using the wrapper script (defaults to the DEFAULT_GITHUB_OWNER env variable)
./claude-webhook myrepo "Your command for Claude"

# With explicit owner
./claude-webhook owner/repo "Your command for Claude"

# Using the CLI directly
node cli/webhook-cli.js --repo myrepo --command "Your command"
```

#### Options

- `-r, --repo <repo>`: GitHub repository (format: owner/repo or repo) [required]
  - If only repo name is provided, defaults to `${DEFAULT_GITHUB_OWNER}/repo`
- `-c, --command <command>`: Command to send to Claude [required]
- `-i, --issue <number>`: Issue number (default: 1)
- `-p, --pr`: Treat as pull request instead of issue
- `-b, --branch <branch>`: Branch name for PR (only used with --pr)
- `-u, --url <url>`: API URL (default: from .env or https://claude.jonathanflatt.org)
- `-s, --secret <secret>`: Webhook secret (default: from .env)
- `-t, --token <token>`: GitHub token (default: from .env)
- `-v, --verbose`: Verbose output

#### Examples

```bash
# Basic issue comment (uses default owner)
./claude-webhook myrepo "Analyze the code structure"

# With explicit owner
./claude-webhook myorg/myrepo "Analyze the code structure"

# Pull request review
./claude-webhook myrepo "Review this PR" -p -b feature-branch

# Specific issue number
./claude-webhook myrepo "Fix the bug in issue #42" -i 42

# Verbose output
./claude-webhook myrepo "List all files" -v

# Custom API URL
./claude-webhook myrepo "Test command" -u https://api.example.com
```

#### Response Format

The CLI will display:
- Success/failure status
- Claude's response
- Context information (repository, issue/PR number, type)

Example output:
```
🚀 Sending command to Claude for owner/myrepo...
📋 Command: Analyze the code structure
📄 Type: Issue

✅ Success!
Status: 200

📝 Claude Response:
--------------------------------------------------
Here's an analysis of the code structure...
--------------------------------------------------

📍 Context:
{
  "repo": "owner/myrepo",
  "issue": 1,
  "type": "issue_comment"
}
```

## Claude Hub CLI

A command-line interface to manage autonomous Claude Code container sessions.

### Overview

Claude Hub CLI allows you to run multiple autonomous Claude Code sessions in isolated Docker containers. Each session can work independently on different repositories or tasks, with full persistence and management capabilities.

### Installation

1. Ensure you have Node.js and Docker installed
2. Install dependencies:
   ```bash
   cd cli
   npm install
   ```
3. Build the TypeScript files:
   ```bash
   npm run build
   ```

### Configuration

Create a `.env` file in the root directory with:

```env
# Required for GitHub operations
GITHUB_TOKEN=your-github-token

# Required for Claude operations (one of these)
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_AUTH_HOST_DIR=~/.claude

# Optional configurations
DEFAULT_GITHUB_OWNER=your-github-username
BOT_USERNAME=ClaudeBot
BOT_EMAIL=claude@example.com
CLAUDE_CONTAINER_IMAGE=claudecode:latest
```

### Usage

#### Basic Commands

```bash
# Start a new autonomous session
./claude-hub start owner/repo "Implement the new authentication system"

# Start a batch of tasks from a YAML file
./claude-hub start-batch tasks.yaml --parallel

# List all sessions
./claude-hub list

# View session logs
./claude-hub logs abc123

# Follow logs in real-time
./claude-hub logs abc123 --follow

# Continue a session with additional instructions
./claude-hub continue abc123 "Also update the documentation"

# Stop a session
./claude-hub stop abc123

# Stop all running sessions
./claude-hub stop all

# Recover a stopped session
./claude-hub recover abc123

# Synchronize session statuses with container states
./claude-hub sync
```

#### Command Reference

##### `start`

Start a new autonomous Claude Code session:

```bash
./claude-hub start <repo> "<command>" [options]
```

Options:
- `-p, --pr [number]`: Treat as pull request and optionally specify PR number
- `-i, --issue <number>`: Treat as issue and specify issue number
- `-b, --branch <branch>`: Branch name for PR
- `-m, --memory <limit>`: Memory limit (e.g., "2g")
- `-c, --cpu <shares>`: CPU shares (e.g., "1024")
- `--pids <limit>`: Process ID limit (e.g., "256")

Examples:
```bash
# Basic repository task
./claude-hub start myorg/myrepo "Implement feature X"

# Work on a specific PR
./claude-hub start myrepo "Fix bug in authentication" --pr 42

# Work on a specific issue
./claude-hub start myrepo "Investigate the problem" --issue 123

# Work on a specific branch with custom resource limits
./claude-hub start myrepo "Optimize performance" -b feature-branch -m 4g -c 2048
```

##### `start-batch`

Start multiple autonomous Claude Code sessions from a YAML file:

```bash
./claude-hub start-batch <file> [options]
```

Options:
- `-p, --parallel`: Run tasks in parallel (default: sequential)
- `-c, --concurrent <number>`: Maximum number of concurrent tasks (default: 2)

Example YAML file format (`tasks.yaml`):
```yaml
- repo: owner/repo1
  command: "Implement feature X"
  
- repo: owner/repo2
  command: "Fix bug in authentication"
  pr: 42
  branch: feature-branch
  
- repo: owner/repo3
  command: "Investigate issue"
  issue: 123
  resourceLimits:
    memory: "4g"
    cpuShares: "2048"
    pidsLimit: "512"
```

Examples:
```bash
# Run tasks sequentially
./claude-hub start-batch tasks.yaml

# Run tasks in parallel (max 2 concurrent)
./claude-hub start-batch tasks.yaml --parallel

# Run tasks in parallel with 4 concurrent tasks
./claude-hub start-batch tasks.yaml --parallel --concurrent 4
```

##### `list`

List autonomous Claude Code sessions:

```bash
./claude-hub list [options]
```

Options:
- `-s, --status <status>`: Filter by status (running, completed, failed, stopped)
- `-r, --repo <repo>`: Filter by repository name
- `-l, --limit <number>`: Limit number of sessions shown
- `--json`: Output as JSON

Examples:
```bash
# List all sessions
./claude-hub list

# List only running sessions
./claude-hub list --status running

# List sessions for a specific repository
./claude-hub list --repo myrepo

# Get JSON output for automation
./claude-hub list --json
```

##### `logs`

View logs from a Claude Code session:

```bash
./claude-hub logs <id> [options]
```

Options:
- `-f, --follow`: Follow log output
- `-t, --tail <number>`: Number of lines to show from the end of the logs

Examples:
```bash
# View logs for a session
./claude-hub logs abc123

# Follow logs in real-time
./claude-hub logs abc123 --follow

# Show only the last 10 lines
./claude-hub logs abc123 --tail 10
```

##### `continue`

Continue an autonomous Claude Code session with a new command:

```bash
./claude-hub continue <id> "<command>"
```

Examples:
```bash
# Add more instructions to a session
./claude-hub continue abc123 "Also update the documentation"

# Ask a follow-up question
./claude-hub continue abc123 "Why did you choose this approach?"
```

##### `stop`

Stop an autonomous Claude Code session:

```bash
./claude-hub stop <id|all> [options]
```

Options:
- `-f, --force`: Force stop (kill) the container
- `--remove`: Remove the session after stopping

Examples:
```bash
# Stop a session
./claude-hub stop abc123

# Force stop a session and remove it
./claude-hub stop abc123 --force --remove

# Stop all running sessions
./claude-hub stop all
```

##### `recover`

Recover a stopped session by recreating its container:

```bash
./claude-hub recover <id>
```

Examples:
```bash
# Recover a stopped session
./claude-hub recover abc123
```

##### `sync`

Synchronize session statuses with container states:

```bash
./claude-hub sync
```

This command checks all sessions marked as "running" to verify if their containers are actually running, and updates the status accordingly.

### Session Lifecycle

1. **Starting**: Creates a new container with the repository cloned and command executed
2. **Running**: Container continues to run autonomously until task completion or manual stopping
3. **Continuation**: Additional commands can be sent to running sessions
4. **Stopping**: Sessions can be stopped manually, preserving their state
5. **Recovery**: Stopped sessions can be recovered by recreating their containers
6. **Removal**: Session records can be removed while preserving logs

### Batch Processing

The CLI supports batch processing of multiple tasks from a YAML file. This is useful for:

1. **Task queuing**: Set up multiple related tasks to run in sequence
2. **Parallel execution**: Run multiple independent tasks concurrently
3. **Standardized configuration**: Define consistent resource limits and repository contexts

### Storage

Session information is stored in `~/.claude-hub/sessions/` as JSON files.

## Troubleshooting

1. **Authentication errors**: Ensure your GitHub token and Claude authentication are correct
2. **Connection errors**: Verify the API URL is correct and the service is running
3. **Invalid signatures**: Check that the webhook secret matches the server configuration
4. **Docker errors**: Verify Docker is running and you have sufficient permissions
5. **Resource constraints**: If sessions are failing, try increasing memory limits
6. **Stopped sessions**: Use the `recover` command to restart stopped sessions
7. **Inconsistent statuses**: Use the `sync` command to update session statuses based on container states

## Security

- The webhook CLI uses the webhook secret to sign requests
- GitHub tokens are used for authentication with the GitHub API
- All autonomous sessions run in isolated Docker containers
- Resource limits prevent containers from consuming excessive resources
- Claude authentication is securely mounted from your local Claude installation
- Always store secrets in environment variables, never in code