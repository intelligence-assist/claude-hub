# Secure Claude Webhook CLI

A more secure version of the CLI that uses encrypted configuration instead of environment variables.

## Why Secure Version?

1. **No Environment Variables**: Credentials are not exposed in process lists or logs
2. **Encrypted Storage**: Configuration is encrypted with AES-256-GCM
3. **Password Protection**: Access requires a password to decrypt credentials
4. **Proper Regex Escaping**: Handles special characters in secrets correctly

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize secure configuration:
   ```bash
   node cli/secure-config.js
   ```
   You'll be prompted for:
   - API URL (default: https://claude.jonathanflatt.org)
   - GitHub Token
   - Webhook Secret
   - A password to encrypt the configuration

## Usage

```bash
# Basic usage
./claude-webhook-secure myrepo "Your command"

# With owner
./claude-webhook-secure owner/repo "Your command"

# Pull request
./claude-webhook-secure myrepo "Review PR" -p -b feature-branch
```

## How It Works

1. **First Run**: Prompts for credentials and password
2. **Encryption**: Stores credentials in `~/.claude-webhook/config.enc`
3. **Subsequent Runs**: Prompts for password to decrypt credentials
4. **No Environment Variables**: All credentials are loaded from encrypted file

## Security Features

- **AES-256-GCM encryption** with authenticated encryption
- **PBKDF2 key derivation** with 100,000 iterations
- **Random salt and IV** for each encryption
- **File permissions** set to 0600 (user read/write only)
- **No plaintext storage** of credentials

## Comparison with Standard CLI

| Feature | Standard CLI | Secure CLI |
|---------|-------------|------------|
| Credential Storage | Environment variables | Encrypted file |
| Password Protection | No | Yes |
| Process List Exposure | Yes | No |
| Log Exposure Risk | High | Low |
| Special Character Handling | Basic | Robust |

## Migration from Standard CLI

If you have a `.env` file:
1. Run the secure config setup
2. Enter your credentials from the `.env` file
3. Delete the `.env` file
4. Use `claude-webhook-secure` instead of `claude-webhook`

## Troubleshooting

1. **Forgot Password**: Delete `~/.claude-webhook/config.enc` and run setup again
2. **Wrong Password**: You'll get an error - try again with correct password
3. **Permission Denied**: Check file permissions on `~/.claude-webhook/`