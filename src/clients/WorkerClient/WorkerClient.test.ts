import { EventBroker } from '../../core/EventBroker';
import { WorkerClient } from './WorkerClient';

type TestEventType = 'user.created.v1' | 'analytics.tracked.v1';

type TestEventPayloads = {
  'user.created.v1': { userId: string; email: string };
  'analytics.tracked.v1': { event: string; properties: Record<string, any> };
};

describe('WorkerClient', () => {
  let broker: EventBroker<TestEventType, TestEventPayloads>;
  let client: WorkerClient<TestEventType>;
  let mockWorker: any;

  beforeEach(() => {
    broker = new EventBroker<TestEventType, TestEventPayloads>();

    // Create mock Worker
    mockWorker = {
      postMessage: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      terminate: jest.fn(),
    };

    client = new WorkerClient('worker_client', broker, mockWorker);
  });

  afterEach(() => {
    client.destroy();
  });

  test('should create and register in broker', () => {
    expect(client.id).toBe('worker_client');
    expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  test('should subscribe to events and send to Worker', async () => {
    client.on('analytics.tracked.v1');

    // Trigger event from broker
    await broker.broadcast('analytics.tracked.v1', 'test_app', {
      event: 'user_registration',
      properties: { source: 'web' },
    });

    expect(mockWorker.postMessage).toHaveBeenCalled();
    const sentData = JSON.parse(mockWorker.postMessage.mock.calls[0][0]);
    expect(sentData.type).toBe('analytics.tracked.v1');
    expect(sentData.data.event).toBe('user_registration');
  });

  test('should handle incoming messages from Worker', async () => {
    const broadcastSpy = jest.spyOn(broker, 'broadcast');

    // Get the message handler
    const messageHandler = mockWorker.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];

    // Simulate incoming Worker message
    const incomingMessage = {
      type: 'user.created.v1',
      source: 'worker',
      id: 'worker-123',
      specversion: '1.0',
      data: { userId: '123', email: 'test@example.com' },
      'mfe-recipient': '*',
    };

    messageHandler(
      new MessageEvent('message', {
        data: JSON.stringify(incomingMessage),
      }),
    );

    expect(broadcastSpy).toHaveBeenCalledWith('user.created.v1', 'worker_client', {
      userId: '123',
      email: 'test@example.com',
    });
  });

  test('should cleanup on destroy', () => {
    client.destroy();

    expect(mockWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  test('should use dispatch for unicast', async () => {
    const result = await client.dispatch('user.created.v1', 'backend', {
      userId: '123',
      email: 'test@example.com',
    });

    expect(result.status).toBe('NACK'); // No subscriber
  });

  test('should use dispatch for broadcast', async () => {
    const result = await client.dispatch('analytics.tracked.v1', '*', {
      event: 'test',
      properties: {},
    });

    expect(result.status).toBe('NACK'); // No subscribers
  });
});
