# Claude Webhook CLI

A command-line interface to interact with the Claude GitHub webhook service.

## Installation

1. Ensure you have Node.js installed
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Create a `.env` file in the root directory with:

```env
API_URL=https://claude.jonathanflatt.org
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-token
```

## Usage

### Basic Usage

```bash
# Using the wrapper script (defaults to the DEFAULT_GITHUB_OWNER env variable)
./claude-webhook myrepo "Your command for Claude"

# With explicit owner
./claude-webhook owner/repo "Your command for Claude"

# Using the CLI directly
node cli/webhook-cli.js --repo myrepo --command "Your command"
```

### Options

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

### Examples

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

## Response Format

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

## Troubleshooting

1. **Authentication errors**: Ensure your webhook secret and GitHub token are correct
2. **Connection errors**: Verify the API URL is correct and the service is running
3. **Invalid signatures**: Check that the webhook secret matches the server configuration

## Security

- The CLI uses the webhook secret to sign requests
- GitHub tokens are used for authentication with the GitHub API
- Always store secrets in environment variables, never in code