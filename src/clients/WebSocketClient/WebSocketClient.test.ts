import { EventBroker } from '../../core/EventBroker';
import { WebSocketClient } from './WebSocketClient';

type TestEventType = 'user.created.v1' | 'notification.sent.v1';

type TestEventPayloads = {
  'user.created.v1': { userId: string; email: string };
  'notification.sent.v1': { message: string };
};

describe('WebSocketClient', () => {
  let broker: EventBroker<TestEventType, TestEventPayloads>;
  let client: WebSocketClient<TestEventType>;
  let mockWs: any;

  beforeEach(() => {
    broker = new EventBroker<TestEventType, TestEventPayloads>();

    // Create mock WebSocket
    mockWs = {
      readyState: 1, // OPEN
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    };

    client = new WebSocketClient('websocket_client', broker, mockWs);
  });

  afterEach(() => {
    client.destroy();
  });

  test('should create and register in broker', () => {
    expect(client.id).toBe('websocket_client');
    expect(mockWs.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should subscribe to events and send to WebSocket', async () => {
    client.on('user.created.v1');

    // Trigger event from broker
    await broker.broadcast('user.created.v1', 'test_app', {
      userId: '123',
      email: 'test@example.com',
    });

    expect(mockWs.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentData.type).toBe('user.created.v1');
    expect(sentData.data.userId).toBe('123');
  });

  test('should handle incoming messages from WebSocket', async () => {
    const sendToSpy = jest.spyOn(broker, 'sendTo');

    // Get the message handler
    const messageHandler = mockWs.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];

    // Simulate incoming WebSocket message
    const incomingMessage = {
      type: 'notification.sent.v1',
      source: 'backend',
      id: 'backend-123',
      specversion: '1.0',
      data: { message: 'Hello from backend' },
      'mfe-recipient': 'frontend_app',
    };

    messageHandler(
      new MessageEvent('message', {
        data: JSON.stringify(incomingMessage),
      }),
    );

    expect(sendToSpy).toHaveBeenCalledWith(
      'notification.sent.v1',
      'websocket_client',
      'frontend_app',
      { message: 'Hello from backend' },
      true, // skipSync=true for WebSocket events
    );
  });

  test('should cleanup on destroy', () => {
    client.destroy();

    expect(mockWs.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should use dispatch for unicast', async () => {
    const result = await client.dispatch('user.created.v1', 'backend', {
      userId: '123',
      email: 'test@example.com',
    });

    expect(result.status).toBe('NACK'); // No subscriber
  });

  test('should use dispatch for broadcast', async () => {
    const result = await client.dispatch('user.created.v1', '*', {
      userId: '123',
      email: 'test@example.com',
    });

    expect(result.status).toBe('NACK'); // No subscribers
  });
});
