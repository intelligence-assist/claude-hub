import type { Request, Response } from 'express';
import { WebhookProcessor } from '../../../../src/core/webhook/WebhookProcessor';
import { webhookRegistry } from '../../../../src/core/webhook/WebhookRegistry';
import type { WebhookProvider, WebhookEventHandler } from '../../../../src/types/webhook';

// Mock the logger
jest.mock('../../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockProvider: WebhookProvider;
  let mockHandler: WebhookEventHandler;

  beforeEach(() => {
    processor = new WebhookProcessor();

    mockReq = {
      body: { test: 'data' },
      headers: { 'x-test-header': 'test-value' },
      rawBody: '{"test":"data"}'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockProvider = {
      name: 'test-provider',
      verifySignature: jest.fn().mockResolvedValue(true),
      parsePayload: jest.fn().mockResolvedValue({
        id: 'test-123',
        timestamp: '2024-01-01T00:00:00Z',
        event: 'test.event',
        source: 'test-provider',
        data: { test: 'data' }
      }),
      getEventType: jest.fn().mockReturnValue('test.event'),
      getEventDescription: jest.fn().mockReturnValue('Test event')
    };

    mockHandler = {
      event: 'test.event',
      handle: jest.fn().mockResolvedValue({
        success: true,
        message: 'Handled successfully'
      })
    };

    // Clear registry before each test
    webhookRegistry.clear();
  });

  describe('processWebhook', () => {
    it('should process webhook successfully', async () => {
      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', mockHandler);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        secret: 'test-secret'
      });

      expect(mockProvider.verifySignature).toHaveBeenCalledWith(mockReq, 'test-secret');
      expect(mockProvider.parsePayload).toHaveBeenCalledWith(mockReq);
      expect(mockHandler.handle).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook processed',
        event: 'test.event',
        handlerCount: 1,
        results: [
          {
            success: true,
            message: 'Handled successfully'
          }
        ]
      });
    });

    it('should return 404 for unknown provider', async () => {
      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'unknown-provider'
      });

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Provider 'unknown-provider' not found"
      });
    });

    it('should return 401 for invalid signature', async () => {
      mockProvider.verifySignature = jest.fn().mockResolvedValue(false);
      webhookRegistry.registerProvider(mockProvider);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        secret: 'test-secret'
      });

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid webhook signature'
      });
    });

    it('should skip signature verification when specified', async () => {
      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', mockHandler);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        secret: 'test-secret',
        skipSignatureVerification: true
      });

      expect(mockProvider.verifySignature).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle no registered handlers', async () => {
      webhookRegistry.registerProvider(mockProvider);
      // No handlers registered

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook received but no handlers registered',
        event: 'test.event'
      });
    });

    it('should execute multiple handlers', async () => {
      const handler1: WebhookEventHandler = {
        event: 'test.event',
        priority: 100,
        handle: jest.fn().mockResolvedValue({
          success: true,
          message: 'Handler 1 success'
        })
      };

      const handler2: WebhookEventHandler = {
        event: 'test.event',
        priority: 50,
        handle: jest.fn().mockResolvedValue({
          success: true,
          message: 'Handler 2 success'
        })
      };

      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', handler1);
      webhookRegistry.registerHandler('test-provider', handler2);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(handler1.handle).toHaveBeenCalled();
      expect(handler2.handle).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook processed',
        event: 'test.event',
        handlerCount: 2,
        results: [
          { success: true, message: 'Handler 1 success' },
          { success: true, message: 'Handler 2 success' }
        ]
      });
    });

    it('should return 207 for partial handler failures', async () => {
      const handler1: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn().mockResolvedValue({
          success: true,
          message: 'Handler 1 success'
        })
      };

      const handler2: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn().mockResolvedValue({
          success: false,
          error: 'Handler 2 failed'
        })
      };

      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', handler1);
      webhookRegistry.registerHandler('test-provider', handler2);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(mockRes.status).toHaveBeenCalledWith(207); // Multi-Status
    });

    it('should skip handlers that cannot handle the event', async () => {
      const handlerWithCanHandle: WebhookEventHandler = {
        event: 'test.event',
        canHandle: jest.fn().mockReturnValue(false),
        handle: jest.fn()
      };

      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', handlerWithCanHandle);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(handlerWithCanHandle.canHandle).toHaveBeenCalled();
      expect(handlerWithCanHandle.handle).not.toHaveBeenCalled();
    });

    it('should handle handler exceptions', async () => {
      const failingHandler: WebhookEventHandler = {
        event: 'test.event',
        handle: jest.fn().mockRejectedValue(new Error('Handler error'))
      };

      webhookRegistry.registerProvider(mockProvider);
      webhookRegistry.registerHandler('test-provider', failingHandler);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(mockRes.status).toHaveBeenCalledWith(207);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook processed',
        event: 'test.event',
        handlerCount: 1,
        results: [
          {
            success: false,
            error: 'Handler error'
          }
        ]
      });
    });

    it('should handle provider parse errors', async () => {
      mockProvider.parsePayload = jest.fn().mockRejectedValue(new Error('Parse error'));
      webhookRegistry.registerProvider(mockProvider);

      await processor.processWebhook(mockReq as Request, mockRes as Response, {
        provider: 'test-provider',
        skipSignatureVerification: true
      });

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Parse error'
      });
    });
  });
});
