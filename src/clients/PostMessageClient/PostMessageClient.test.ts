import { EventBroker } from '../../core/EventBroker';
import { PostMessageClient } from './PostMessageClient';

type TestEvents = 'test.event.v1' | 'iframe.ready.v1';
type TestPayloads = {
  'test.event.v1': { message: string };
  'iframe.ready.v1': { iframeId: string };
};

describe('PostMessageClient', () => {
  let broker: EventBroker<TestEvents, TestPayloads, string>;
  let mockWindow: any;

  beforeEach(() => {
    broker = new EventBroker();

    // Mock Window object
    mockWindow = {
      postMessage: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      location: { origin: 'https://example.com' },
    };

    // Mock global window for event listening
    global.window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as any;
  });

  afterEach(() => {
    broker.destroy();
  });

  test('should create client and register in broker', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    expect(broker.getAllClients()).toHaveLength(1);
    expect(broker.getAllClients()[0].id).toBe('iframe');
  });

  test('should subscribe to events via on()', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    const unsubscribe = client.on('test.event.v1');

    expect(broker.getSubscribedClients()).toContain('iframe');
    expect(typeof unsubscribe).toBe('function');
  });

  test('should send events to iframe via postMessage', async () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');
    client.on('test.event.v1');

    // Отправляем событие через брокер
    await broker.broadcast('test.event.v1', 'app' as any, { message: 'Hello iframe' });

    expect(mockWindow.postMessage).toHaveBeenCalled();
    const [sentData, targetOrigin] = mockWindow.postMessage.mock.calls[0];

    expect(sentData.type).toBe('test.event.v1');
    expect(sentData.data).toEqual({ message: 'Hello iframe' });
    expect(targetOrigin).toBe('https://iframe.com');
  });

  test('should use targetOrigin when sending', async () => {
    const client = new PostMessageClient(
      'iframe',
      broker,
      mockWindow,
      'https://specific-origin.com',
    );
    client.on('test.event.v1');

    await broker.broadcast('test.event.v1', 'app' as any, { message: 'Test' });

    const [, targetOrigin] = mockWindow.postMessage.mock.calls[0];
    expect(targetOrigin).toBe('https://specific-origin.com');
  });

  test('should use "*" as default targetOrigin', async () => {
    const client = new PostMessageClient('iframe', broker, mockWindow);
    client.on('test.event.v1');

    await broker.broadcast('test.event.v1', 'app' as any, { message: 'Test' });

    const [, targetOrigin] = mockWindow.postMessage.mock.calls[0];
    expect(targetOrigin).toBe('*');
  });

  test('should handle errors in postMessage', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindow.postMessage = jest.fn().mockImplementation(() => {
      throw new Error('postMessage failed');
    });

    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');
    client.on('test.event.v1');

    await broker.broadcast('test.event.v1', 'app' as any, { message: 'Test' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[iframe] postMessage failed:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  test('should unsubscribe correctly via off()', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    client.on('test.event.v1');
    expect(broker.getSubscribedClients()).toContain('iframe');

    client.off('test.event.v1');
    expect(broker.getSubscriptions()['iframe']).toEqual([]);
  });

  test('should unsubscribe correctly via unsubscribe function', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    const unsubscribe = client.on('test.event.v1');
    expect(broker.getSubscribedClients()).toContain('iframe');

    unsubscribe();
    expect(broker.getSubscriptions()['iframe']).toEqual([]);
  });

  test('should cleanup resources on destroy()', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');
    client.on('test.event.v1');

    expect(broker.getAllClients()).toHaveLength(1);

    client.destroy();

    expect(broker.getAllClients()).toHaveLength(0);
    expect(global.window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should register message handler on creation', () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    expect(global.window.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should have correct clientType', () => {
    expect(PostMessageClient.clientType).toBe('PostMessageClient');
  });

  test('should support dispatch with unicast', async () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');
    const receiver = broker;

    let receivedEvent: any = null;
    receiver.subscribe('target', 'test.event.v1', (event: any) => {
      receivedEvent = event;
    });

    const result = await client.dispatch('test.event.v1', 'target', { message: 'Unicast' });

    expect(result.status).toBe('ACK');
  });

  test('should support dispatch with broadcast', async () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    let receivedEvent: any = null;
    broker.subscribe('other-client', 'test.event.v1', (event: any) => {
      receivedEvent = event;
    });

    const result = await client.dispatch('test.event.v1', '*', { message: 'Broadcast' });

    expect(result.status).toBe('ACK');
  });

  test('should return NACK when sending to nonexistent client', async () => {
    const client = new PostMessageClient('iframe', broker, mockWindow, 'https://iframe.com');

    const result = await client.dispatch('test.event.v1', 'nonexistent', { message: 'Test' });

    expect(result.status).toBe('NACK');
  });
});
