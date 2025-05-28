# Discord Chatbot Provider Setup

## Overview

This implementation provides a comprehensive chatbot provider system that integrates Claude with Discord using slash commands. The system requires repository and branch parameters to function properly.

## Architecture

- **ChatbotProvider.js**: Abstract base class for all chatbot providers
- **DiscordProvider.js**: Discord-specific implementation with Ed25519 signature verification
- **ProviderFactory.js**: Dependency injection singleton for managing providers
- **chatbotController.js**: Generic webhook handler working with any provider
- **chatbot.js**: Express routes with rate limiting

## Required Environment Variables

```bash
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_APPLICATION_ID=your_discord_application_id
DISCORD_AUTHORIZED_USERS=user1,user2,admin
DISCORD_BOT_MENTION=claude
```

## Discord Slash Command Configuration

In the Discord Developer Portal, create a slash command with these parameters:

- **Command Name**: `claude`
- **Description**: `Ask Claude to help with repository tasks`
- **Parameters**:
  - `repo` (required, string): Repository in format "owner/name"
  - `branch` (optional, string): Git branch name (defaults to "main")
  - `command` (required, string): Command for Claude to execute

## API Endpoints

- `POST /api/webhooks/chatbot/discord` - Discord webhook handler (rate limited: 100 req/15min per IP)
- `GET /api/webhooks/chatbot/stats` - Provider statistics and status

## Usage Examples

```
/claude repo:owner/myrepo command:help me fix this bug
/claude repo:owner/myrepo branch:feature command:review this code
/claude repo:owner/myrepo command:add error handling to this function
```

## Security Features

- Ed25519 webhook signature verification
- User authorization checking  
- Repository parameter validation
- Rate limiting (100 requests per 15 minutes per IP)
- Container isolation for Claude execution
- Input sanitization and validation

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in `.env`:
   ```bash
   DISCORD_BOT_TOKEN=your_token
   DISCORD_PUBLIC_KEY=your_public_key
   DISCORD_APPLICATION_ID=your_app_id
   DISCORD_AUTHORIZED_USERS=user1,user2
   ```

3. Configure Discord slash command in Developer Portal

4. Start the server:
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## Testing

```bash
# Run all unit tests
npm run test:unit

# Run specific provider tests
npm test -- test/unit/providers/DiscordProvider.test.js

# Run controller tests
npm test -- test/unit/controllers/chatbotController.test.js
```

## Key Features Implemented

1. **Repository Parameter Validation**: Commands require a `repo` parameter in "owner/name" format
2. **Branch Support**: Optional `branch` parameter (defaults to "main")
3. **Error Handling**: Comprehensive error messages with reference IDs
4. **Rate Limiting**: Protection against abuse with express-rate-limit
5. **Message Splitting**: Automatic splitting for Discord's 2000 character limit
6. **Comprehensive Testing**: 35+ unit tests covering all scenarios

## Workflow

1. User executes Discord slash command: `/claude repo:owner/myrepo command:fix this issue`
2. Discord sends webhook to `/api/webhooks/chatbot/discord`
3. System verifies signature and parses payload
4. Repository parameter is validated (required)
5. Branch parameter is extracted (defaults to "main")
6. User authorization is checked
7. Command is processed by Claude with repository context
8. Response is sent back to Discord (automatically split if needed)

## Extension Points

The architecture supports easy addition of new platforms:
- Implement new provider class extending ChatbotProvider
- Add environment configuration in ProviderFactory
- Register provider and add route handler
- System automatically handles authentication, validation, and Claude integration