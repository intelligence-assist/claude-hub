# Chatbot Providers Documentation

This document describes the chatbot provider system that enables Claude to work with multiple chat platforms like Discord, Slack, and Nextcloud using dependency injection and configuration-based selection.

## Architecture Overview

The chatbot provider system uses a flexible architecture with:

- **Base Provider Interface**: Common contract for all chatbot providers (`ChatbotProvider.js`)
- **Provider Implementations**: Platform-specific implementations (Discord, Slack, Nextcloud)
- **Provider Factory**: Dependency injection container for managing providers (`ProviderFactory.js`)
- **Generic Controller**: Unified webhook handling logic (`chatbotController.js`)
- **Route Integration**: Clean API endpoints for each provider

## Available Providers

### Discord Provider
**Status**: ✅ Implemented  
**Endpoint**: `POST /api/webhooks/chatbot/discord`

Features:
- Ed25519 signature verification
- Slash command support
- Interactive component handling
- Message splitting for 2000 character limit
- Follow-up message support

### Slack Provider
**Status**: 🚧 Placeholder (ready for implementation)  
**Endpoint**: `POST /api/webhooks/chatbot/slack`

Planned features:
- HMAC-SHA256 signature verification
- Slash command support
- Interactive component handling
- Thread support

### Nextcloud Provider
**Status**: 🚧 Placeholder (ready for implementation)  
**Endpoint**: `POST /api/webhooks/chatbot/nextcloud`

Planned features:
- Basic authentication
- Talk app integration
- File sharing capabilities

## Configuration

### Environment Variables

#### Discord
```bash
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_APPLICATION_ID=your_discord_application_id
DISCORD_AUTHORIZED_USERS=user1,user2,admin
DISCORD_BOT_MENTION=claude
```

#### Slack (Future)
```bash
SLACK_BOT_TOKEN=xoxb-your_slack_bot_token
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_AUTHORIZED_USERS=user1,user2,admin
SLACK_BOT_MENTION=@claude
```

#### Nextcloud (Future)
```bash
NEXTCLOUD_SERVER_URL=https://your-nextcloud.example.com
NEXTCLOUD_USERNAME=claude_bot
NEXTCLOUD_PASSWORD=your_nextcloud_password
NEXTCLOUD_AUTHORIZED_USERS=user1,user2,admin
NEXTCLOUD_BOT_MENTION=@claude
```

## API Endpoints

### Webhook Endpoints

- `POST /api/webhooks/chatbot/discord` - Discord webhook handler
- `POST /api/webhooks/chatbot/slack` - Slack webhook handler
- `POST /api/webhooks/chatbot/nextcloud` - Nextcloud webhook handler

### Management Endpoints

- `GET /api/webhooks/chatbot/stats` - Provider statistics and status

## Usage Examples

### Discord Setup

1. **Create Discord Application**
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Copy Application ID, Bot Token, and Public Key

2. **Configure Webhook**
   - Set webhook URL to `https://your-domain.com/api/webhooks/chatbot/discord`
   - Configure slash commands in Discord Developer Portal

3. **Environment Setup**
   ```bash
   DISCORD_BOT_TOKEN=your_bot_token
   DISCORD_PUBLIC_KEY=your_public_key
   DISCORD_APPLICATION_ID=your_app_id
   DISCORD_AUTHORIZED_USERS=user1,user2
   ```

4. **Test the Bot**
   - Use slash commands: `/claude help me with this code`
   - Bot responds directly in Discord channel

### Adding a New Provider

To add a new chatbot provider:

1. **Create Provider Class**
   ```javascript
   // src/providers/NewProvider.js
   const ChatbotProvider = require('./ChatbotProvider');
   
   class NewProvider extends ChatbotProvider {
     async initialize() {
       // Provider-specific initialization
     }
     
     verifyWebhookSignature(req) {
       // Platform-specific signature verification
     }
     
     parseWebhookPayload(payload) {
       // Parse platform-specific payload
     }
     
     // Implement all required methods...
   }
   
   module.exports = NewProvider;
   ```

2. **Register Provider**
   ```javascript
   // src/providers/ProviderFactory.js
   const NewProvider = require('./NewProvider');
   
   // In constructor:
   this.registerProvider('newprovider', NewProvider);
   ```

3. **Add Route Handler**
   ```javascript
   // src/controllers/chatbotController.js
   async function handleNewProviderWebhook(req, res) {
     return await handleChatbotWebhook(req, res, 'newprovider');
   }
   ```

4. **Add Environment Config**
   ```javascript
   // In ProviderFactory.js getEnvironmentConfig():
   case 'newprovider':
     config.apiKey = process.env.NEWPROVIDER_API_KEY;
     config.secret = process.env.NEWPROVIDER_SECRET;
     // Add other config...
     break;
   ```

## Security Features

### Webhook Verification
Each provider implements platform-specific signature verification:
- **Discord**: Ed25519 signature verification
- **Slack**: HMAC-SHA256 signature verification  
- **GitHub**: HMAC-SHA256 signature verification (existing)

### User Authorization
- Configurable authorized user lists per provider
- Provider-specific user ID validation
- Graceful handling of unauthorized access attempts

### Container Security
- Isolated execution environment for Claude commands
- Resource limits and capability restrictions
- Secure credential management

## Provider Factory

The `ProviderFactory` manages provider instances using dependency injection:

```javascript
const providerFactory = require('./providers/ProviderFactory');

// Create provider from environment
const discord = await providerFactory.createFromEnvironment('discord');

// Get existing provider
const provider = providerFactory.getProvider('discord');

// Get statistics
const stats = providerFactory.getStats();
```

## Error Handling

The system provides comprehensive error handling:

- **Provider Initialization Errors**: Graceful fallback and logging
- **Webhook Verification Failures**: Clear error responses
- **Command Processing Errors**: User-friendly error messages with reference IDs
- **Network/API Errors**: Automatic retry logic where appropriate

## Monitoring and Debugging

### Logging
All providers use structured logging with:
- Provider name identification
- Request/response tracking
- Error correlation IDs
- Performance metrics

### Statistics Endpoint
The `/api/webhooks/chatbot/stats` endpoint provides:
- Provider registration status
- Initialization health
- Basic configuration info (non-sensitive)

### Health Checks
Providers can be health-checked individually or collectively to ensure proper operation.

## Future Enhancements

- **Message Threading**: Support for threaded conversations
- **Rich Media**: File attachments and embeds
- **Interactive Components**: Buttons, dropdowns, forms
- **Multi-provider Commands**: Cross-platform functionality
- **Provider Plugins**: Dynamic provider loading
- **Advanced Authorization**: Role-based access control