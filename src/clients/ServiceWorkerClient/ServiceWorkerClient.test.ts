import { EventBroker } from '../../core/EventBroker';
import { ServiceWorkerClient } from './ServiceWorkerClient';

type TestEvents = 'test.event.v1' | 'notification.push.v1';
type TestPayloads = {
  'test.event.v1': { message: string };
  'notification.push.v1': { title: string; body: string };
};

describe('ServiceWorkerClient', () => {
  let broker: EventBroker<TestEvents, TestPayloads>;
  let mockServiceWorker: any;
  let mockNavigator: any;

  beforeEach(() => {
    broker = new EventBroker();

    // Mock ServiceWorker
    mockServiceWorker = {
      postMessage: jest.fn(),
      state: 'activated',
    };

    // Mock navigator.serviceWorker
    mockNavigator = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    // Replace global navigator.serviceWorker
    Object.defineProperty(global, 'navigator', {
      value: { serviceWorker: mockNavigator },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    broker.destroy();
  });

  test('should create client and register in broker', () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    expect(broker.getAllClients()).toHaveLength(1);
    expect(broker.getAllClients()[0].id).toBe('sw');
  });

  test('should subscribe to events via on()', () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    const unsubscribe = client.on('test.event.v1');

    expect(broker.getSubscribedClients()).toContain('sw');
    expect(typeof unsubscribe).toBe('function');
  });

  test('should send events to Service Worker via postMessage', async () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);
    client.on('test.event.v1');

    // Отправляем событие через брокер
    await broker.broadcast('test.event.v1', 'app' as any, { message: 'Hello SW' });

    expect(mockServiceWorker.postMessage).toHaveBeenCalled();
    const sentData = JSON.parse(mockServiceWorker.postMessage.mock.calls[0][0]);
    expect(sentData.type).toBe('test.event.v1');
    expect(sentData.data).toEqual({ message: 'Hello SW' });
  });

  test('should receive events from Service Worker and dispatch to broker', async () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    let receivedEvent: any = null;
    broker.subscribe('app', 'notification.push.v1', (event: any) => {
      receivedEvent = event;
    });

    // Симулируем входящее сообщение от Service Worker
    const incomingEvent = {
      type: 'notification.push.v1',
      data: { title: 'New Message', body: 'You have a new message' },
      'mfe-recipient': '*',
    };

    const messageEvent = new MessageEvent('message', {
      data: JSON.stringify(incomingEvent),
    });

    // Вызываем обработчик напрямую (т.к. мы мокаем addEventListener)
    const addEventListenerCall = mockNavigator.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    );
    expect(addEventListenerCall).toBeDefined();

    const handler = addEventListenerCall[1];
    handler(messageEvent);

    // Даём время на асинхронную обработку
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent.type).toBe('notification.push.v1');
    expect(receivedEvent.data).toEqual({ title: 'New Message', body: 'You have a new message' });
  });

  test('should handle unicast events correctly', async () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    let receivedEvent: any = null;
    broker.subscribe('target-client', 'test.event.v1', (event: any) => {
      receivedEvent = event;
    });

    // Симулируем unicast сообщение от Service Worker
    const incomingEvent = {
      type: 'test.event.v1',
      data: { message: 'Unicast message' },
      'mfe-recipient': 'target-client',
    };

    const messageEvent = new MessageEvent('message', {
      data: JSON.stringify(incomingEvent),
    });

    const handler = mockNavigator.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];
    handler(messageEvent);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent.type).toBe('test.event.v1');
  });

  test('should ignore invalid messages', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    const invalidEvent = new MessageEvent('message', {
      data: JSON.stringify({ invalid: 'event' }),
    });

    const handler = mockNavigator.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];
    handler(invalidEvent);

    expect(consoleSpy).toHaveBeenCalledWith('[sw] Invalid event format:', { invalid: 'event' });
    consoleSpy.mockRestore();
  });

  test('should unsubscribe correctly via off()', () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    client.on('test.event.v1');
    expect(broker.getSubscribedClients()).toContain('sw');

    client.off('test.event.v1');
    expect(broker.getSubscriptions()['sw']).toEqual([]);
  });

  test('should cleanup resources on destroy()', () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);
    client.on('test.event.v1');

    expect(broker.getAllClients()).toHaveLength(1);

    client.destroy();

    expect(broker.getAllClients()).toHaveLength(0);
    expect(mockNavigator.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should use client id as sender when dispatching', async () => {
    const client = new ServiceWorkerClient('sw', broker, mockServiceWorker);

    let receivedEvent: any = null;
    broker.subscribe('app', 'test.event.v1', (event: any) => {
      receivedEvent = event;
    });

    // Симулируем сообщение от SW с другим source
    const incomingEvent = {
      type: 'test.event.v1',
      source: 'some-other-source',
      data: { message: 'Test' },
      'mfe-recipient': '*',
    };

    const messageEvent = new MessageEvent('message', {
      data: JSON.stringify(incomingEvent),
    });

    const handler = mockNavigator.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];
    handler(messageEvent);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Проверяем, что source это ID клиента, а не то что пришло в сообщении
    expect(receivedEvent.source).toBe('sw');
  });
});
