import { EventBroker } from '../../core/EventBroker';
import { InMemoryClient } from './InMemoryClient';

type TestEvents = 'test.event.v1' | 'user.created.v1';
type TestPayloads = {
  'test.event.v1': { message: string };
  'user.created.v1': { userId: string; email: string };
};

describe('InMemoryClient', () => {
  let broker: EventBroker<TestEvents, TestPayloads, string>;

  beforeEach(() => {
    broker = new EventBroker();
  });

  afterEach(() => {
    broker.destroy();
  });

  test('should create client and register in broker', () => {
    const client = new InMemoryClient('test-client', broker);

    expect(broker.getAllClients()).toHaveLength(1);
    expect(broker.getAllClients()[0].id).toBe('test-client');
  });

  test('should subscribe to events via on() with handler', () => {
    const client = new InMemoryClient('test-client', broker);
    const handler = jest.fn();

    const unsubscribe = client.on('test.event.v1', handler);

    expect(broker.getSubscribedClients()).toContain('test-client');
    expect(typeof unsubscribe).toBe('function');
  });

  test('should throw error when subscribing without handler', () => {
    const client = new InMemoryClient('test-client', broker);

    expect(() => {
      client.on('test.event.v1');
    }).toThrow('InMemoryClient requires explicit handler function');
  });

  test('should receive events via handler', async () => {
    const client1 = new InMemoryClient('sender', broker);
    const client2 = new InMemoryClient('receiver', broker);

    let receivedEvent: any = null;
    client2.on('test.event.v1', (event: any) => {
      receivedEvent = event;
    });

    await client1.sendTo('receiver', 'test.event.v1', { message: 'Hello' });

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent.type).toBe('test.event.v1');
    expect(receivedEvent.data).toEqual({ message: 'Hello' });
    expect(receivedEvent.source).toBe('sender');
  });

  test('should send unicast events via sendTo()', async () => {
    const sender = new InMemoryClient('sender', broker);
    const receiver = new InMemoryClient('receiver', broker);

    const handler = jest.fn();
    receiver.on('test.event.v1', handler);

    const result = await sender.sendTo('receiver', 'test.event.v1', { message: 'Unicast' });

    expect(result.status).toBe('ACK');
    expect(handler).toHaveBeenCalled();
  });

  test('should send broadcast events via broadcast()', async () => {
    const sender = new InMemoryClient('sender', broker);
    const receiver1 = new InMemoryClient('receiver1', broker);
    const receiver2 = new InMemoryClient('receiver2', broker);

    const handler1 = jest.fn();
    const handler2 = jest.fn();

    receiver1.on('test.event.v1', handler1);
    receiver2.on('test.event.v1', handler2);

    const result = await sender.broadcast('test.event.v1', { message: 'Broadcast' });

    expect(result.status).toBe('ACK');
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  test('should send events via dispatch() with unicast', async () => {
    const sender = new InMemoryClient('sender', broker);
    const receiver = new InMemoryClient('receiver', broker);

    const handler = jest.fn();
    receiver.on('test.event.v1', handler);

    const result = await sender.dispatch('test.event.v1', 'receiver', {
      message: 'Dispatch unicast',
    });

    expect(result.status).toBe('ACK');
    expect(handler).toHaveBeenCalled();
  });

  test('should send events via dispatch() with broadcast', async () => {
    const sender = new InMemoryClient('sender', broker);
    const receiver = new InMemoryClient('receiver', broker);

    const handler = jest.fn();
    receiver.on('test.event.v1', handler);

    const result = await sender.dispatch('test.event.v1', '*', { message: 'Dispatch broadcast' });

    expect(result.status).toBe('ACK');
    expect(handler).toHaveBeenCalled();
  });

  test('should return NACK when sending to nonexistent client', async () => {
    const sender = new InMemoryClient('sender', broker);

    const result = await sender.sendTo('nonexistent', 'test.event.v1', { message: 'Test' });

    expect(result.status).toBe('NACK');
    expect(result.message).toContain('not subscribed');
  });

  test('should unsubscribe correctly via off()', () => {
    const client = new InMemoryClient('test-client', broker);
    const handler = jest.fn();

    client.on('test.event.v1', handler);
    expect(broker.getSubscribedClients()).toContain('test-client');

    client.off('test.event.v1', handler);
    expect(broker.getSubscriptions()['test-client']).toEqual([]);
  });

  test('should unsubscribe correctly via unsubscribe function', () => {
    const client = new InMemoryClient('test-client', broker);
    const handler = jest.fn();

    const unsubscribe = client.on('test.event.v1', handler);
    expect(broker.getSubscribedClients()).toContain('test-client');

    unsubscribe();
    expect(broker.getSubscriptions()['test-client']).toEqual([]);
  });

  test('should cleanup resources on destroy()', () => {
    const client = new InMemoryClient('test-client', broker);
    const handler = jest.fn();

    client.on('test.event.v1', handler);
    expect(broker.getAllClients()).toHaveLength(1);

    client.destroy();

    expect(broker.getAllClients()).toHaveLength(0);
  });

  test('should support multiple subscriptions to different events', async () => {
    const sender = new InMemoryClient('sender', broker);
    const receiver = new InMemoryClient('receiver', broker);

    const handler1 = jest.fn();
    const handler2 = jest.fn();

    receiver.on('test.event.v1', handler1);
    receiver.on('user.created.v1', handler2);

    await sender.sendTo('receiver', 'test.event.v1', { message: 'Test' });
    await sender.sendTo('receiver', 'user.created.v1', { userId: '123', email: 'test@test.com' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test('should work correctly with multiple clients', async () => {
    const client1 = new InMemoryClient('client1', broker);
    const client2 = new InMemoryClient('client2', broker);
    const client3 = new InMemoryClient('client3', broker);

    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    client1.on('test.event.v1', handler1);
    client2.on('test.event.v1', handler2);
    client3.on('test.event.v1', handler3);

    await client1.broadcast('test.event.v1', { message: 'Broadcast to all' });

    // client1 не должен получить своё же событие
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(handler3).toHaveBeenCalled();
  });

  test('should have correct clientType', () => {
    expect(InMemoryClient.clientType).toBe('InMemoryClient');
  });
});
