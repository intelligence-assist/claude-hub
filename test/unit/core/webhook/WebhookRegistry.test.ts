import { WebhookRegistry } from '../../../../src/core/webhook/WebhookRegistry';
import type { WebhookProvider, WebhookEventHandler } from '../../../../src/types/webhook';

describe('WebhookRegistry', () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider: WebhookProvider = {
        name: 'test-provider',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      registry.registerProvider(provider);
      expect(registry.hasProvider('test-provider')).toBe(true);
      expect(registry.getProvider('test-provider')).toBe(provider);
    });

    it('should overwrite existing provider with warning', () => {
      const provider1: WebhookProvider = {
        name: 'test-provider',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      const provider2: WebhookProvider = {
        name: 'test-provider',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      registry.registerProvider(provider1);
      registry.registerProvider(provider2);

      expect(registry.getProvider('test-provider')).toBe(provider2);
    });
  });

  describe('registerHandler', () => {
    it('should register a handler', () => {
      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler);
      expect(registry.getHandlerCount('test-provider')).toBe(1);
    });

    it('should sort handlers by priority', () => {
      const lowPriorityHandler: WebhookEventHandler = {
        event: 'test.event',
        priority: 10,
        handle: jest.fn()
      };

      const highPriorityHandler: WebhookEventHandler = {
        event: 'test.event',
        priority: 100,
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', lowPriorityHandler);
      registry.registerHandler('test-provider', highPriorityHandler);

      const handlers = registry.getHandlers('test-provider', 'test.event');
      expect(handlers[0]).toBe(highPriorityHandler);
      expect(handlers[1]).toBe(lowPriorityHandler);
    });

    it('should handle handlers without priority', () => {
      const handler1: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      const handler2: WebhookEventHandler = {
        event: 'test.event',
        priority: 50,
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler1);
      registry.registerHandler('test-provider', handler2);

      const handlers = registry.getHandlers('test-provider', 'test.event');
      expect(handlers[0]).toBe(handler2);
      expect(handlers[1]).toBe(handler1);
    });
  });

  describe('getHandlers', () => {
    it('should return handlers for exact event match', () => {
      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler);
      const handlers = registry.getHandlers('test-provider', 'test.event');

      expect(handlers).toHaveLength(1);
      expect(handlers[0]).toBe(handler);
    });

    it('should return handlers for wildcard match', () => {
      const handler: WebhookEventHandler = {
        event: 'test.*',
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler);

      expect(registry.getHandlers('test-provider', 'test.event')).toHaveLength(1);
      expect(registry.getHandlers('test-provider', 'test.another')).toHaveLength(1);
      expect(registry.getHandlers('test-provider', 'other.event')).toHaveLength(0);
    });

    it('should return handlers for regex match', () => {
      const handler: WebhookEventHandler = {
        event: /^issue\.(opened|closed)$/,
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler);

      expect(registry.getHandlers('test-provider', 'issue.opened')).toHaveLength(1);
      expect(registry.getHandlers('test-provider', 'issue.closed')).toHaveLength(1);
      expect(registry.getHandlers('test-provider', 'issue.edited')).toHaveLength(0);
    });

    it('should return empty array for no matches', () => {
      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerHandler('test-provider', handler);
      const handlers = registry.getHandlers('test-provider', 'other.event');

      expect(handlers).toHaveLength(0);
    });

    it('should handle case-insensitive provider names', () => {
      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerHandler('TestProvider', handler);

      expect(registry.getHandlers('testprovider', 'test.event')).toHaveLength(1);
      expect(registry.getHandlers('TESTPROVIDER', 'test.event')).toHaveLength(1);
    });
  });

  describe('getAllProviders', () => {
    it('should return all registered providers', () => {
      const provider1: WebhookProvider = {
        name: 'provider1',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      const provider2: WebhookProvider = {
        name: 'provider2',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      registry.registerProvider(provider1);
      registry.registerProvider(provider2);

      const providers = registry.getAllProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });

    it('should return empty array when no providers registered', () => {
      expect(registry.getAllProviders()).toHaveLength(0);
    });
  });

  describe('getHandlerCount', () => {
    it('should return count for specific provider', () => {
      const handler1: WebhookEventHandler = {
        event: 'event1',
        handle: jest.fn()
      };

      const handler2: WebhookEventHandler = {
        event: 'event2',
        handle: jest.fn()
      };

      registry.registerHandler('provider1', handler1);
      registry.registerHandler('provider1', handler2);
      registry.registerHandler('provider2', handler1);

      expect(registry.getHandlerCount('provider1')).toBe(2);
      expect(registry.getHandlerCount('provider2')).toBe(1);
    });

    it('should return total count when no provider specified', () => {
      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerHandler('provider1', handler);
      registry.registerHandler('provider2', handler);
      registry.registerHandler('provider3', handler);

      expect(registry.getHandlerCount()).toBe(3);
    });

    it('should return 0 for unknown provider', () => {
      expect(registry.getHandlerCount('unknown')).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all providers and handlers', () => {
      const provider: WebhookProvider = {
        name: 'test-provider',
        verifySignature: jest.fn(),
        parsePayload: jest.fn(),
        getEventType: jest.fn(),
        getEventDescription: jest.fn()
      };

      const handler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn()
      };

      registry.registerProvider(provider);
      registry.registerHandler('test-provider', handler);

      registry.clear();

      expect(registry.hasProvider('test-provider')).toBe(false);
      expect(registry.getHandlerCount()).toBe(0);
    });
  });
});
