/**
 * EventBroker CloudEvents v1.0 Integration Tests
 */

import { EventBroker } from './EventBroker';
import { InMemoryClient } from '../clients/InMemoryClient/InMemoryClient';

// Test event types
type TestEventType = 'user.created.v1' | 'order.placed.v1';
type TestEventPayloads = {
  'user.created.v1': { userId: string; email: string };
  'order.placed.v1': { orderId: string; amount: number };
};

describe('EventBroker CloudEvents v1.0', () => {
  let broker: EventBroker<TestEventType, TestEventPayloads>;

  beforeEach(() => {
    broker = new EventBroker<TestEventType, TestEventPayloads>();
  });

  afterEach(() => {
    broker.destroy();
  });

  test('should create events in CloudEvents v1.0 format', () => {
    const client = new InMemoryClient('user-service', broker);
    const receiverClient = new InMemoryClient('notification-service', broker);

    // Clients are registered automatically in constructor

    let receivedEvent: any;

    receiverClient.on('user.created.v1', (event) => {
      receivedEvent = event;
    });

    // Send event (tab sync is automatic)
    client.sendTo('notification-service', 'user.created.v1', {
      userId: '123',
      email: 'test@example.com',
    });

    const event = receivedEvent;

    // Check required CloudEvents fields
    expect(event.specversion).toBe('1.0');
    expect(event.type).toBe('user.created.v1');
    expect(event.source).toBe('user-service');
    expect(event.id).toBeDefined();
    expect(event.time).toBeDefined();
    expect(event.datacontenttype).toBe('application/json');

    // Check data
    expect(event.data).toEqual({ userId: '123', email: 'test@example.com' });

    // Check MFE extensions
    expect(event['mfe-recipient']).toBe('notification-service');
    expect(event['mfe-sessionid']).toBeDefined();

    // CloudEvents structure matches type
    expect(event.specversion).toBe('1.0');
  });

  test('should process events through subscribers', (done) => {
    const receiverClient = new InMemoryClient('test-service', broker);
    const senderClient = new InMemoryClient('user-service', broker);

    // Clients are registered automatically in constructor

    // Subscribe to event at receiver
    receiverClient.on('user.created.v1', (event) => {
      expect(event.type).toBe('user.created.v1');
      expect(event.source).toBe('user-service');
      expect((event.data as any).userId).toBe('123');
      expect(event['mfe-recipient']).toBe('test-service');
      done();
    });

    // Send event from sender
    senderClient.sendTo('test-service', 'user.created.v1', {
      userId: '123',
      email: 'test@example.com',
    });
  });

  test('should support broadcast events', async () => {
    const handlerCalls: string[] = [];

    const client1 = new InMemoryClient('service-1', broker);
    const client2 = new InMemoryClient('service-2', broker);
    const client3 = new InMemoryClient('service-3', broker);

    // Clients are registered automatically in constructor

    // Subscribe to event from different services
    client1.on('order.placed.v1', () => {
      handlerCalls.push('service-1');
    });
    client2.on('order.placed.v1', () => {
      handlerCalls.push('service-2');
    });
    client3.on('order.placed.v1', () => {
      handlerCalls.push('service-3');
    });

    // Broadcast from client1
    const result = await client1.broadcast('order.placed.v1', {
      orderId: 'order-123',
      amount: 100,
    });

    // Check that all subscribers except sender received the event
    expect(handlerCalls).toContain('service-2');
    expect(handlerCalls).toContain('service-3');
    expect(handlerCalls).not.toContain('service-1'); // Sender doesn't receive

    expect(result.status).toBe('ACK');
  });

  test('should return NACK if no subscribers', async () => {
    const client = new InMemoryClient('user-service', broker);

    // Send event without subscribers
    const result = await client.broadcast('user.created.v1', {
      userId: '123',
      email: 'test@example.com',
    });

    expect(result.status).toBe('NACK');
    expect(result.message).toContain('No subscribers');
  });

  describe('ACK Pattern (Transport acknowledgment)', () => {
    test('should acknowledge successful event delivery (ACK)', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Clients are registered automatically in constructor

      let eventReceived = false;

      // Subscribe at receiver
      receiverClient.on('user.created.v1', (event) => {
        console.log('Handler called - event DELIVERED:', (event.data as any).userId);
        eventReceived = true;
      });

      // Send event and wait for ACK
      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.message).toContain('delivered and handled');
      expect(result.clientId).toBe('receiver');
      expect(eventReceived).toBe(true);
    });

    test('should return NACK when no subscription', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Clients are registered automatically in constructor
      // BUT no subscription!

      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.message).toContain('not subscribed');
    });

    test('should return NACK on handler errors', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Clients are registered automatically in constructor

      // Subscribe with failing handler
      receiverClient.on('user.created.v1', () => {
        console.log('Handler called - event DELIVERED');
        throw new Error('Business logic failed');
      });

      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.message).toContain('not handled');
    });

    test('dispatch always returns Promise with delivery result', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Clients are registered automatically in constructor

      receiverClient.on('user.created.v1', () => {
        /* handler */
      });

      const resultPromise = senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      // Check that it's a Promise
      expect(resultPromise).toBeInstanceOf(Promise);

      const result = await resultPromise;

      // Check that result has required fields
      expect(result.status).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test('should support ACK for broadcast events', async () => {
      const client1 = new InMemoryClient('service-1', broker);
      const client2 = new InMemoryClient('service-2', broker);

      // Clients are registered automatically in constructor

      client2.on('order.placed.v1', () => {
        /* handler */
      });

      const result = await client1.broadcast('order.placed.v1', {
        orderId: 'order-123',
        amount: 100,
      });

      expect(result.status).toBe('ACK');
      expect(result.message).toContain('subscriber');
    });
  });

  describe('sendTo() and broadcast() methods', () => {
    test('sendTo() should send message to specific client', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);
      const otherClient = new InMemoryClient('other', broker);

      // Clients are registered automatically in constructor

      let receiverCalled = false;
      let otherCalled = false;

      receiverClient.on('user.created.v1', () => {
        receiverCalled = true;
      });

      otherClient.on('user.created.v1', () => {
        otherCalled = true;
      });

      // Send only to receiver
      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(receiverCalled).toBe(true);
      expect(otherCalled).toBe(false); // other didn't receive
    });

    test('sendTo() should return NACK for non-existent client', async () => {
      const senderClient = new InMemoryClient('sender', broker);

      const result = await senderClient.sendTo('non-existent', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.message).toContain('not subscribed');
    });

    test('sendTo() should return NACK if handler throws error', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Clients are registered automatically in constructor

      receiverClient.on('user.created.v1', () => {
        throw new Error('Handler error');
      });

      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
    });

    test('broadcast() should send message to all clients except sender', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const client1 = new InMemoryClient('client-1', broker);
      const client2 = new InMemoryClient('client-2', broker);

      // Clients are registered automatically in constructor

      const calls: string[] = [];

      client1.on('order.placed.v1', () => {
        calls.push('client-1');
      });

      client2.on('order.placed.v1', () => {
        calls.push('client-2');
      });

      senderClient.on('order.placed.v1', () => {
        calls.push('sender');
      });

      await senderClient.broadcast('order.placed.v1', {
        orderId: 'order-123',
        amount: 100,
      });

      expect(calls).toContain('client-1');
      expect(calls).toContain('client-2');
      expect(calls).not.toContain('sender'); // Sender doesn't receive
    });

    test('broadcast() should work when no other clients', async () => {
      const senderClient = new InMemoryClient('sender', broker);

      senderClient.on('order.placed.v1', () => {
        /* handler */
      });

      const result = await senderClient.broadcast('order.placed.v1', {
        orderId: 'order-123',
        amount: 100,
      });

      // No subscribers except sender
      expect(result.status).toBe('NACK');
    });

    test('broadcast() should handle handler errors correctly', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const errorClient = new InMemoryClient('error_client', broker);
      const successClient = new InMemoryClient('success_client', broker);

      // Clients are registered automatically in constructor

      // Spy on console.error to suppress error output in test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      errorClient.on('order.placed.v1', () => {
        throw new Error('Handler error');
      });

      let successCalled = false;
      successClient.on('order.placed.v1', () => {
        successCalled = true;
      });

      // Broadcast continues despite individual handler errors
      const result = await senderClient.broadcast('order.placed.v1', {
        orderId: 'order-123',
        amount: 100,
      });

      expect(result.status).toBe('ACK'); // Broadcast is fire-and-forget
      expect(successCalled).toBe(true); // Successful handler still executed
      expect(consoleErrorSpy).toHaveBeenCalled(); // Error was logged

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Client Subscription/Unsubscription', () => {
    test('should unsubscribe handler via off()', () => {
      const client = new InMemoryClient('test-client', broker);

      // Client is registered automatically in constructor

      let callCount = 0;

      const handler = () => {
        callCount++;
      };

      client.on('user.created.v1', handler);

      // Send event - handler should be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '123',
        email: 'test1@test.com',
      });
      expect(callCount).toBe(1);

      client.sendTo('test-client', 'user.created.v1', {
        userId: '456',
        email: 'test2@test.com',
      });
      expect(callCount).toBe(2);

      // Unsubscribe via off()
      client.off('user.created.v1');

      // Send event - handler should NOT be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '999',
        email: 'test3@test.com',
      });
      expect(callCount).toBe(2); // Still 2
    });

    test('should unsubscribe without handler reference', () => {
      const client = new InMemoryClient('test-client', broker);

      // Client is registered automatically in constructor

      let callCount = 0;

      client.on('user.created.v1', () => {
        callCount++;
      });

      // Send event - handler should be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '123',
        email: 'test1@test.com',
      });
      expect(callCount).toBe(1);

      // Unsubscribe without handler reference (removes all handlers for this event type)
      client.off('user.created.v1');

      // Send event - handler should NOT be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '999',
        email: 'test2@test.com',
      });
      expect(callCount).toBe(1); // Still 1
    });

    test('should work correctly with on/off and callback unsubscription', () => {
      const client = new InMemoryClient('test-client', broker);

      // Client is registered automatically in constructor

      let callCount = 0;

      const handler = () => {
        callCount++;
      };

      client.on('user.created.v1', handler);

      // Send event - handler should be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '123',
        email: 'test1@test.com',
      });
      expect(callCount).toBe(1);

      client.sendTo('test-client', 'user.created.v1', {
        userId: '456',
        email: 'test3@test.com',
      });
      expect(callCount).toBe(2);

      // Unsubscribe via off()
      client.off('user.created.v1');

      // Send event - handler should NOT be called
      client.sendTo('test-client', 'user.created.v1', {
        userId: '999',
        email: 'test4@test.com',
      });
      expect(callCount).toBe(2); // Still 2
    });
  });

  // ========================================
  // Request-Reply Pattern Tests
  // ========================================

  describe('Request-Reply Pattern', () => {
    test('should return data from handler', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const serviceClient = new InMemoryClient('service', broker);

      const mockUser = { id: 123, name: 'John Doe', email: 'john@example.com' };

      serviceClient.on('user.created.v1', (event) => {
        return mockUser; // Return data
      });

      const result = await senderClient.sendTo('service', 'user.created.v1', {
        userId: '123',
        email: 'john@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.data).toEqual(mockUser);
    });

    test('should handle async data fetching', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const serviceClient = new InMemoryClient('service', broker);

      serviceClient.on('user.created.v1', async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          userId: event.data.userId,
          processedAt: Date.now(),
        };
      });

      const result = await senderClient.sendTo('service', 'user.created.v1', {
        userId: '456',
        email: 'alice@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.data).toHaveProperty('userId', '456');
      expect(result.data).toHaveProperty('processedAt');
    });

    test('should handle void return (no response data)', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const serviceClient = new InMemoryClient('service', broker);

      let eventReceived = false;

      serviceClient.on('user.created.v1', (event) => {
        eventReceived = true;
        // No return = traditional event handler
      });

      const result = await senderClient.sendTo('service', 'user.created.v1', {
        userId: '789',
        email: 'test@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.data).toBeUndefined();
      expect(eventReceived).toBe(true);
    });

    test('should handle undefined return', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const serviceClient = new InMemoryClient('service', broker);

      serviceClient.on('user.created.v1', () => {
        return undefined; // Explicit undefined
      });

      const result = await senderClient.sendTo('service', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.data).toBeUndefined();
    });

    test('should return NACK when handler throws error', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const serviceClient = new InMemoryClient('service', broker);

      serviceClient.on('user.created.v1', () => {
        throw new Error('Handler failed');
      });

      const result = await senderClient.sendTo('service', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.data).toBeUndefined();
    });

    test('Real-world use case: User validation service', async () => {
      const formClient = new InMemoryClient('form', broker);
      const validationClient = new InMemoryClient('validation', broker);

      validationClient.on('user.created.v1', (event) => {
        const { email } = event.data;
        const isValid = email.includes('@');

        return {
          valid: isValid,
          errors: isValid ? [] : ['Invalid email format'],
        };
      });

      const result = await formClient.sendTo('validation', 'user.created.v1', {
        userId: 'test',
        email: 'invalid-email',
      });

      expect(result.status).toBe('ACK');
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toContain('Invalid email format');
    });
  });
});
