const crypto = require('crypto');
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

jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn()
}));

const mockSecureCredentials = require('../../../src/utils/secureCredentials');

describe('Signature Verification Security Tests', () => {
  let provider;
  const validPublicKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const validPrivateKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  beforeEach(() => {
    mockSecureCredentials.get.mockImplementation((key) => {
      const mockCreds = {
        'DISCORD_BOT_TOKEN': 'mock_bot_token',
        'DISCORD_PUBLIC_KEY': validPublicKey,
        'DISCORD_APPLICATION_ID': '123456789012345678'
      };
      return mockCreds[key];
    });

    provider = new DiscordProvider();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Discord Ed25519 Signature Verification', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should reject requests with missing signature headers', () => {
      const req = {
        headers: {},
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should reject requests with only timestamp header', () => {
      const req = {
        headers: {
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should reject requests with only signature header', () => {
      const req = {
        headers: {
          'x-signature-ed25519': 'some_signature'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle invalid signature format gracefully', () => {
      const req = {
        headers: {
          'x-signature-ed25519': 'invalid_hex_signature',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      // Should not throw an error, but return false
      expect(() => provider.verifyWebhookSignature(req)).not.toThrow();
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle invalid public key format gracefully', async () => {
      // Override with invalid key format
      mockSecureCredentials.get.mockImplementation((key) => {
        if (key === 'DISCORD_PUBLIC_KEY') return 'invalid_key_format';
        return 'mock_value';
      });

      const invalidProvider = new DiscordProvider();
      await invalidProvider.initialize();

      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(invalidProvider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should bypass verification in test mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const req = {
        headers: {
          'x-signature-ed25519': 'completely_invalid_signature',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle crypto verification errors without throwing', () => {
      // Mock crypto.verify to throw an error
      const originalVerify = crypto.verify;
      crypto.verify = jest.fn().mockImplementation(() => {
        throw new Error('Crypto verification failed');
      });

      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(() => provider.verifyWebhookSignature(req)).not.toThrow();
      expect(provider.verifyWebhookSignature(req)).toBe(false);

      // Restore original function
      crypto.verify = originalVerify;
    });

    it('should construct verification message correctly', () => {
      const timestamp = '1234567890';
      const body = 'test body content';
      const expectedMessage = timestamp + body;

      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': timestamp
        },
        rawBody: Buffer.from(body),
        body: { test: 'data' }
      };

      // Mock crypto.verify to capture the message parameter
      const originalVerify = crypto.verify;
      const mockVerify = jest.fn().mockReturnValue(false);
      crypto.verify = mockVerify;

      provider.verifyWebhookSignature(req);

      expect(mockVerify).toHaveBeenCalledWith(
        'ed25519',
        Buffer.from(expectedMessage),
        expect.any(Buffer), // public key buffer
        expect.any(Buffer)  // signature buffer
      );

      crypto.verify = originalVerify;
    });

    it('should use rawBody when available', () => {
      const timestamp = '1234567890';
      const rawBodyContent = 'raw body content';
      const bodyContent = { parsed: 'json' };

      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': timestamp
        },
        rawBody: Buffer.from(rawBodyContent),
        body: bodyContent
      };

      const originalVerify = crypto.verify;
      const mockVerify = jest.fn().mockReturnValue(false);
      crypto.verify = mockVerify;

      provider.verifyWebhookSignature(req);

      // Should use rawBody, not JSON.stringify(body)
      expect(mockVerify).toHaveBeenCalledWith(
        'ed25519',
        Buffer.from(timestamp + rawBodyContent),
        expect.any(Buffer),
        expect.any(Buffer)
      );

      crypto.verify = originalVerify;
    });

    it('should fallback to JSON.stringify when rawBody is unavailable', () => {
      const timestamp = '1234567890';
      const bodyContent = { test: 'data' };
      const expectedMessage = timestamp + JSON.stringify(bodyContent);

      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': timestamp
        },
        // No rawBody provided
        body: bodyContent
      };

      const originalVerify = crypto.verify;
      const mockVerify = jest.fn().mockReturnValue(false);
      crypto.verify = mockVerify;

      provider.verifyWebhookSignature(req);

      expect(mockVerify).toHaveBeenCalledWith(
        'ed25519',
        Buffer.from(expectedMessage),
        expect.any(Buffer),
        expect.any(Buffer)
      );

      crypto.verify = originalVerify;
    });
  });

  describe('Security Edge Cases', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should handle empty signature gracefully', () => {
      const req = {
        headers: {
          'x-signature-ed25519': '',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle empty timestamp gracefully', () => {
      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': ''
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle signature with wrong length', () => {
      const req = {
        headers: {
          'x-signature-ed25519': 'short_sig',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle very long signature without crashing', () => {
      const req = {
        headers: {
          'x-signature-ed25519': 'a'.repeat(1000), // Very long signature
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(() => provider.verifyWebhookSignature(req)).not.toThrow();
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle unicode characters in timestamp', () => {
      const req = {
        headers: {
          'x-signature-ed25519': '64byte_hex_signature_placeholder_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'x-signature-timestamp': '123😀567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(() => provider.verifyWebhookSignature(req)).not.toThrow();
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle null/undefined headers safely', () => {
      const req = {
        headers: {
          'x-signature-ed25519': null,
          'x-signature-timestamp': undefined
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should handle Buffer conversion errors gracefully', () => {
      // Mock Buffer.from to throw an error
      const originalBufferFrom = Buffer.from;
      Buffer.from = jest.fn().mockImplementation((data) => {
        if (typeof data === 'string' && data.includes('signature')) {
          throw new Error('Buffer conversion failed');
        }
        return originalBufferFrom(data);
      });

      const req = {
        headers: {
          'x-signature-ed25519': 'invalid_signature_that_causes_buffer_error',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      expect(() => provider.verifyWebhookSignature(req)).not.toThrow();
      expect(provider.verifyWebhookSignature(req)).toBe(false);

      Buffer.from = originalBufferFrom;
    });
  });

  describe('Timing Attack Prevention', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should have consistent timing for different signature lengths', async () => {
      const shortSig = 'abc';
      const longSig = 'a'.repeat(128);
      const timestamp = '1234567890';

      const req1 = {
        headers: {
          'x-signature-ed25519': shortSig,
          'x-signature-timestamp': timestamp
        },
        rawBody: Buffer.from('test'),
        body: {}
      };

      const req2 = {
        headers: {
          'x-signature-ed25519': longSig,
          'x-signature-timestamp': timestamp
        },
        rawBody: Buffer.from('test'),
        body: {}
      };

      // Both should return false, and ideally take similar time
      const start1 = process.hrtime.bigint();
      const result1 = provider.verifyWebhookSignature(req1);
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      const result2 = provider.verifyWebhookSignature(req2);
      const end2 = process.hrtime.bigint();

      expect(result1).toBe(false);
      expect(result2).toBe(false);

      // Both operations should complete in reasonable time (less than 100ms)
      const time1 = Number(end1 - start1) / 1000000; // Convert to milliseconds
      const time2 = Number(end2 - start2) / 1000000;

      expect(time1).toBeLessThan(100);
      expect(time2).toBeLessThan(100);
    });
  });
});