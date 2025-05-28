# Chatbot Providers Documentation

This document describes the chatbot provider system that enables Claude to work with Discord using dependency injection and configuration-based selection. The system is designed with an extensible architecture that can support future platforms.

## Architecture Overview

The chatbot provider system uses a flexible architecture with:

- **Base Provider Interface**: Common contract for all chatbot providers (`ChatbotProvider.js`)
- **Provider Implementations**: Platform-specific implementations (currently Discord only)
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

## API Endpoints

### Webhook Endpoints

- `POST /api/webhooks/chatbot/discord` - Discord webhook handler

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

To add a new chatbot provider in the future:

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
The Discord provider implements Ed25519 signature verification for secure webhook authentication.

### User Authorization
- Configurable authorized user lists for Discord
- Discord-specific user ID validation
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
The Discord provider uses structured logging with:
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
The provider can be health-checked to ensure proper operation.

## Extensible Architecture

While only Discord is currently implemented, the system is designed to easily support additional platforms:

- **Modular Design**: Each provider is self-contained with common interfaces
- **Dependency Injection**: Clean separation between provider logic and application code
- **Configuration-Driven**: Environment-based provider selection and configuration
- **Unified Webhook Handling**: Common controller logic with platform-specific implementations
- **Standardized Security**: Consistent signature verification and authorization patterns

## Future Enhancements

The extensible architecture enables future enhancements such as:

- **Additional Platforms**: Easy integration of new chat platforms
- **Message Threading**: Support for threaded conversations
- **Rich Media**: File attachments and embeds
- **Interactive Components**: Buttons, dropdowns, forms
- **Multi-provider Commands**: Cross-platform functionality
- **Provider Plugins**: Dynamic provider loading
- **Advanced Authorization**: Role-based access control