const DiscordProvider = require('../../../src/providers/DiscordProvider');

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));


describe('Discord Payload Processing Tests', () => {
  let provider;

  beforeEach(() => {
    provider = new DiscordProvider();
  });

  describe('Real Discord Payload Examples', () => {
    it('should parse Discord PING interaction correctly', () => {
      const pingPayload = {
        id: '123456789012345678',
        type: 1,
        version: 1
      };

      const result = provider.parseWebhookPayload(pingPayload);

      expect(result).toEqual({
        type: 'ping',
        shouldRespond: true,
        responseData: { type: 1 }
      });
    });

    it('should parse Discord slash command without options', () => {
      const slashCommandPayload = {
        id: '123456789012345678',
        application_id: '987654321098765432',
        type: 2,
        data: {
          id: '456789012345678901',
          name: 'claude',
          type: 1,
          resolved: {},
          options: []
        },
        guild_id: '111111111111111111',
        channel_id: '222222222222222222',
        member: {
          user: {
            id: '333333333333333333',
            username: 'testuser',
            discriminator: '1234',
            avatar: 'avatar_hash'
          },
          roles: ['444444444444444444'],
          permissions: '2147483647'
        },
        token: 'unique_interaction_token',
        version: 1
      };

      const result = provider.parseWebhookPayload(slashCommandPayload);

      expect(result).toEqual({
        type: 'command',
        command: 'claude',
        options: [],
        channelId: '222222222222222222',
        guildId: '111111111111111111',
        userId: '333333333333333333',
        username: 'testuser',
        content: 'claude',
        interactionToken: 'unique_interaction_token',
        interactionId: '123456789012345678',
        repo: null,
        branch: null
      });
    });

    it('should parse Discord slash command with string option', () => {
      const slashCommandWithOptionsPayload = {
        id: '123456789012345678',
        application_id: '987654321098765432',
        type: 2,
        data: {
          id: '456789012345678901',
          name: 'claude',
          type: 1,
          options: [
            {
              name: 'prompt',
              type: 3,
              value: 'Help me debug this Python function'
            }
          ]
        },
        guild_id: '111111111111111111',
        channel_id: '222222222222222222',
        member: {
          user: {
            id: '333333333333333333',
            username: 'developer',
            discriminator: '5678'
          }
        },
        token: 'another_interaction_token',
        version: 1
      };

      const result = provider.parseWebhookPayload(slashCommandWithOptionsPayload);

      expect(result).toEqual({
        type: 'command',
        command: 'claude',
        options: [
          {
            name: 'prompt',
            type: 3,
            value: 'Help me debug this Python function'
          }
        ],
        channelId: '222222222222222222',
        guildId: '111111111111111111',
        userId: '333333333333333333',
        username: 'developer',
        content: 'claude prompt:Help me debug this Python function',
        interactionToken: 'another_interaction_token',
        interactionId: '123456789012345678',
        repo: null,
        branch: null
      });
    });

    it('should parse Discord slash command with multiple options', () => {
      const multiOptionPayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude',
          options: [
            {
              name: 'action',
              type: 3,
              value: 'review'
            },
            {
              name: 'file',
              type: 3,
              value: 'src/main.js'
            },
            {
              name: 'verbose',
              type: 5,
              value: true
            }
          ]
        },
        channel_id: '222222222222222222',
        member: {
          user: {
            id: '333333333333333333',
            username: 'reviewer'
          }
        },
        token: 'multi_option_token'
      };

      const result = provider.parseWebhookPayload(multiOptionPayload);

      expect(result.content).toBe('claude action:review file:src/main.js verbose:true');
      expect(result.options).toHaveLength(3);
    });

    it('should parse Discord button interaction', () => {
      const buttonInteractionPayload = {
        id: '123456789012345678',
        application_id: '987654321098765432',
        type: 3,
        data: {
          component_type: 2,
          custom_id: 'help_button_click'
        },
        guild_id: '111111111111111111',
        channel_id: '222222222222222222',
        member: {
          user: {
            id: '333333333333333333',
            username: 'buttonclicker'
          }
        },
        message: {
          id: '555555555555555555',
          content: 'Original message content'
        },
        token: 'button_interaction_token',
        version: 1
      };

      const result = provider.parseWebhookPayload(buttonInteractionPayload);

      expect(result).toEqual({
        type: 'component',
        customId: 'help_button_click',
        channelId: '222222222222222222',
        guildId: '111111111111111111',
        userId: '333333333333333333',
        username: 'buttonclicker',
        interactionToken: 'button_interaction_token',
        interactionId: '123456789012345678'
      });
    });

    it('should parse Discord select menu interaction', () => {
      const selectMenuPayload = {
        id: '123456789012345678',
        type: 3,
        data: {
          component_type: 3,
          custom_id: 'language_select',
          values: ['javascript', 'python']
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'selector'
        },
        token: 'select_interaction_token'
      };

      const result = provider.parseWebhookPayload(selectMenuPayload);

      expect(result).toEqual({
        type: 'component',
        customId: 'language_select',
        channelId: '222222222222222222',
        guildId: undefined,
        userId: '333333333333333333',
        username: 'selector',
        interactionToken: 'select_interaction_token',
        interactionId: '123456789012345678'
      });
    });

    it('should handle Discord DM (no guild_id)', () => {
      const dmPayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude',
          options: [
            {
              name: 'question',
              value: 'How do I use async/await in JavaScript?'
            }
          ]
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'dmuser'
        },
        token: 'dm_interaction_token'
      };

      const result = provider.parseWebhookPayload(dmPayload);

      expect(result.guildId).toBeUndefined();
      expect(result.userId).toBe('333333333333333333');
      expect(result.username).toBe('dmuser');
      expect(result.type).toBe('command');
    });

    it('should handle payload with missing optional fields', () => {
      const minimalPayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude'
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'minimaluser'
        },
        token: 'minimal_token'
      };

      const result = provider.parseWebhookPayload(minimalPayload);

      expect(result).toEqual({
        type: 'command',
        command: 'claude',
        options: [],
        channelId: '222222222222222222',
        guildId: undefined,
        userId: '333333333333333333',
        username: 'minimaluser',
        content: 'claude',
        interactionToken: 'minimal_token',
        interactionId: '123456789012345678',
        repo: null,
        branch: null
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle payload with null data gracefully', () => {
      const nullDataPayload = {
        id: '123456789012345678',
        type: 2,
        data: null,
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'nulluser'
        },
        token: 'null_token'
      };

      expect(() => provider.parseWebhookPayload(nullDataPayload)).not.toThrow();
      const result = provider.parseWebhookPayload(nullDataPayload);
      expect(result.content).toBe('');
    });

    it('should handle payload with missing user information', () => {
      const noUserPayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude'
        },
        channel_id: '222222222222222222',
        token: 'no_user_token'
      };

      const result = provider.parseWebhookPayload(noUserPayload);
      expect(result.userId).toBeUndefined();
      expect(result.username).toBeUndefined();
    });

    it('should handle unknown interaction type gracefully', () => {
      const unknownTypePayload = {
        id: '123456789012345678',
        type: 999, // Unknown type
        data: {
          name: 'claude'
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'unknownuser'
        },
        token: 'unknown_token'
      };

      const result = provider.parseWebhookPayload(unknownTypePayload);
      expect(result).toEqual({
        type: 'unknown',
        shouldRespond: false
      });
    });

    it('should handle very large option values', () => {
      const largeValuePayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude',
          options: [
            {
              name: 'code',
              value: 'x'.repeat(4000) // Very large value
            }
          ]
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'largeuser'
        },
        token: 'large_token'
      };

      expect(() => provider.parseWebhookPayload(largeValuePayload)).not.toThrow();
      const result = provider.parseWebhookPayload(largeValuePayload);
      expect(result.content).toContain('claude code:');
      expect(result.content.length).toBeGreaterThan(4000);
    });

    it('should handle special characters in usernames', () => {
      const specialCharsPayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude'
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'user-with_special.chars123'
        },
        token: 'special_token'
      };

      const result = provider.parseWebhookPayload(specialCharsPayload);
      expect(result.username).toBe('user-with_special.chars123');
    });

    it('should handle unicode characters in option values', () => {
      const unicodePayload = {
        id: '123456789012345678',
        type: 2,
        data: {
          name: 'claude',
          options: [
            {
              name: 'message',
              value: 'Hello 世界! 🚀 How are you?'
            }
          ]
        },
        channel_id: '222222222222222222',
        user: {
          id: '333333333333333333',
          username: 'unicodeuser'
        },
        token: 'unicode_token'
      };

      const result = provider.parseWebhookPayload(unicodePayload);
      expect(result.content).toBe('claude message:Hello 世界! 🚀 How are you?');
    });
  });

  describe('buildCommandContent function', () => {
    it('should handle complex nested options structure', () => {
      const complexCommandData = {
        name: 'claude',
        options: [
          {
            name: 'subcommand',
            type: 1,
            options: [
              {
                name: 'param1',
                value: 'value1'
              },
              {
                name: 'param2',
                value: 'value2'
              }
            ]
          }
        ]
      };

      // Note: Current implementation flattens all options
      const result = provider.buildCommandContent(complexCommandData);
      expect(result).toContain('claude');
    });

    it('should handle boolean option values', () => {
      const booleanCommandData = {
        name: 'claude',
        options: [
          {
            name: 'verbose',
            value: true
          },
          {
            name: 'silent',
            value: false
          }
        ]
      };

      const result = provider.buildCommandContent(booleanCommandData);
      expect(result).toBe('claude verbose:true silent:false');
    });

    it('should handle numeric option values', () => {
      const numericCommandData = {
        name: 'claude',
        options: [
          {
            name: 'count',
            value: 42
          },
          {
            name: 'rate',
            value: 3.14
          }
        ]
      };

      const result = provider.buildCommandContent(numericCommandData);
      expect(result).toBe('claude count:42 rate:3.14');
    });
  });
});
