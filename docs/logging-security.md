# Logging Security and Credential Redaction

This document describes the comprehensive credential redaction system implemented in the Claude GitHub Webhook service to prevent sensitive information from being exposed in logs.

## Overview

The logging system uses [Pino](https://getpino.io/) with comprehensive redaction patterns to automatically remove sensitive information from all log outputs. This ensures that credentials, secrets, tokens, and other sensitive data are never exposed in log files, console output, or external monitoring systems.

## Redaction Coverage

### Credential Types Protected

#### 1. AWS Credentials
- **AWS_SECRET_ACCESS_KEY** - AWS secret access keys
- **AWS_ACCESS_KEY_ID** - AWS access key identifiers (AKIA* pattern)
- **AWS_SESSION_TOKEN** - Temporary session tokens
- **AWS_SECURITY_TOKEN** - Security tokens

#### 2. GitHub Credentials
- **GITHUB_TOKEN** - GitHub personal access tokens (ghp_* pattern)
- **GH_TOKEN** - Alternative GitHub token environment variable
- **GitHub PAT tokens** - Fine-grained personal access tokens (github_pat_* pattern)
- **GITHUB_WEBHOOK_SECRET** - Webhook signature secrets

#### 3. Anthropic API Keys
- **ANTHROPIC_API_KEY** - Claude API keys (sk-ant-* pattern)

#### 4. Database Credentials
- **DATABASE_URL** - Full database connection strings
- **DB_PASSWORD** - Database passwords
- **REDIS_PASSWORD** - Redis authentication passwords
- **connectionString** - SQL Server connection strings
- **mongoUrl** - MongoDB connection URLs
- **redisUrl** - Redis connection URLs

#### 5. Generic Sensitive Patterns
- **password**, **passwd**, **pass** - Any password fields
- **secret**, **secretKey**, **secret_key** - Any secret fields
- **token** - Any token fields
- **apiKey**, **api_key** - API key fields
- **credential**, **credentials** - Credential fields
- **key** - Generic key fields
- **privateKey**, **private_key** - Private key content
- **auth**, **authentication** - Authentication objects

#### 6. JWT and Token Types
- **JWT_SECRET** - JWT signing secrets
- **ACCESS_TOKEN** - OAuth access tokens
- **REFRESH_TOKEN** - OAuth refresh tokens
- **BOT_TOKEN** - Bot authentication tokens
- **API_KEY** - Generic API keys
- **SECRET_KEY** - Generic secret keys

#### 7. HTTP Headers
- **authorization** - Authorization headers
- **x-api-key** - API key headers
- **x-auth-token** - Authentication token headers
- **x-github-token** - GitHub token headers
- **bearer** - Bearer token headers

### Context Coverage

#### 1. Top-Level Fields
All sensitive field names are redacted when they appear as direct properties of logged objects.

#### 2. Nested Objects (up to 4 levels deep)
Sensitive patterns are caught in deeply nested object structures:
- `object.nested.password`
- `config.database.connectionString`
- `application.config.api.secret`
- `deeply.nested.auth.token`

#### 3. Environment Variable Containers
- **envVars.*** - Environment variable objects
- **env.*** - Environment configuration objects
- **process.env.*** - Process environment variables (using bracket notation)

#### 4. Error Objects
- **error.message** - Error messages that might contain leaked credentials
- **error.stderr** - Standard error output
- **error.stdout** - Standard output
- **error.dockerCommand** - Docker commands with embedded secrets
- **err.*** - Alternative error object structures

#### 5. Output Streams
- **stderr** - Standard error output
- **stdout** - Standard output
- **output** - Command output
- **logs** - Log content
- **message** - Message content
- **data** - Generic data fields

#### 6. Docker and Command Context
- **dockerCommand** - Docker run commands with -e flags
- **dockerArgs** - Docker argument arrays
- **command** - Shell commands that might contain secrets

#### 7. HTTP Request/Response Objects
- **request.headers.authorization**
- **response.headers.authorization**
- **req.headers.***
- **res.headers.***

#### 8. File Paths
- **credentialsPath** - Paths to credential files
- **keyPath** - Paths to key files
- **secretPath** - Paths to secret files

## Implementation Details

### Pino Redaction Configuration

The redaction is implemented using Pino's built-in `redact` feature with a comprehensive array of path patterns:

```javascript
redact: {
  paths: [
    // Over 200+ specific patterns covering all scenarios
    'password',
    '*.password',
    '*.*.password',
    '*.*.*.password',
    'AWS_SECRET_ACCESS_KEY',
    '*.AWS_SECRET_ACCESS_KEY',
    'envVars.AWS_SECRET_ACCESS_KEY',
    '["process.env.AWS_SECRET_ACCESS_KEY"]',
    // ... many more patterns
  ],
  censor: '[REDACTED]'
}
```

### Pattern Types

1. **Direct patterns**: `'password'` - matches top-level fields
2. **Single wildcard**: `'*.password'` - matches one level deep
3. **Multi-wildcard**: `'*.*.password'` - matches multiple levels deep
4. **Bracket notation**: `'["process.env.GITHUB_TOKEN"]'` - handles special characters
5. **Nested paths**: `'envVars.AWS_SECRET_ACCESS_KEY'` - specific nested paths

## Testing

### Test Coverage

The system includes comprehensive tests to verify redaction effectiveness:

#### 1. Basic Redaction Test (`test-logger-redaction.js`)
- Tests all major credential types
- Verifies nested object redaction
- Ensures safe data remains visible

#### 2. Comprehensive Test Suite (`test-logger-redaction-comprehensive.js`)
- 17 different test scenarios
- Tests deep nesting (4+ levels)
- Tests mixed safe/sensitive data
- Tests edge cases and complex structures

### Running Tests

```bash
# Run basic redaction test
node test/test-logger-redaction.js

# Run comprehensive test suite
node test/test-logger-redaction-comprehensive.js

# Run full test suite
npm test
```

### Validation Checklist

When reviewing logs, ensure:

✅ **Should be [REDACTED]:**
- All passwords, tokens, secrets, API keys
- AWS credentials and session tokens
- GitHub tokens and webhook secrets
- Database connection strings and passwords
- Docker commands containing sensitive environment variables
- Error messages containing leaked credentials
- HTTP headers with authorization data

✅ **Should remain visible:**
- Usernames, emails, repo names, URLs
- Public configuration values
- Non-sensitive debugging information
- Timestamps, log levels, component names

## Security Benefits

### 1. Compliance
- Prevents credential exposure in logs
- Supports audit requirements
- Enables safe log aggregation and monitoring

### 2. Development Safety
- Developers can safely share logs for debugging
- Reduces risk of accidental credential exposure
- Enables comprehensive logging without security concerns

### 3. Production Security
- Log monitoring systems don't receive sensitive data
- External log services (CloudWatch, Datadog, etc.) are safe
- Log files can be safely stored and rotated

### 4. Incident Response
- Detailed logs available for debugging without credential exposure
- Error correlation IDs help track issues without revealing secrets
- Safe log sharing between team members

## Best Practices

### 1. Regular Testing
- Run redaction tests after any logging changes
- Verify new credential patterns are covered
- Test with realistic data scenarios

### 2. Pattern Maintenance
- Add new patterns when introducing new credential types
- Review and update patterns periodically
- Consider deep nesting levels for complex objects

### 3. Monitoring
- Monitor logs for any credential leakage
- Use tools to scan logs for patterns that might indicate leaked secrets
- Review error logs regularly for potential exposure

### 4. Development Guidelines
- Always use structured logging with the logger utility
- Avoid concatenating sensitive data into log messages
- Use specific log levels appropriately
- Test logging in development with real-like data structures

## Configuration

### Environment Variables
The logger automatically redacts these environment variables when they appear in logs:
- `GITHUB_TOKEN`
- `ANTHROPIC_API_KEY`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ACCESS_KEY_ID`
- `GITHUB_WEBHOOK_SECRET`
- And many more...

### Log Levels
- **info**: General application flow
- **warn**: Potentially harmful situations
- **error**: Error events with full context (sanitized)
- **debug**: Detailed information for diagnosing problems

### File Rotation
- Production logs are automatically rotated at 10MB
- Keeps up to 5 backup files
- All rotated logs maintain redaction

## Troubleshooting

### If credentials appear in logs:
1. Identify the specific pattern that wasn't caught
2. Add the new pattern to the redaction paths in `src/utils/logger.js`
3. Add a test case in the test files
4. Run tests to verify the fix
5. Deploy the updated configuration

### Common issues:
- **Deep nesting**: Add more wildcard levels (`*.*.*.*.pattern`)
- **Special characters**: Use bracket notation (`["field-with-dashes"]`)
- **New credential types**: Add to all relevant categories (top-level, nested, env vars)

## Related Documentation

- [AWS Authentication Best Practices](./aws-authentication-best-practices.md)
- [Credential Security](./credential-security.md)
- [Container Security](./container-limitations.md)