# API Reference

Complete API documentation for `@event-broker/core`.

## Table of Contents

- [EventBroker](#eventbroker)
- [Clients](#clients)
  - [InMemoryClient](#inmemoryclient)
  - [WebSocketClient](#websocketclient)
  - [WorkerClient](#workerclient)
  - [PostMessageClient](#postmessageclient)
  - [ServiceWorkerClient](#serviceworkerclient)
- [Types](#types)
- [Hooks](#hooks)

---

## EventBroker

Core event routing and lifecycle management class.

> **Note for Developers:** Most EventBroker methods (`sendTo`, `broadcast`, `subscribe`, `unsubscribe`) are called internally by clients. In application code, you should use client methods (`dispatch`, `on`, `off`) instead. See the [Clients](#clients) section for recommended usage patterns.

### Constructor

```typescript
new EventBroker<T, P, M>();
```

**Type Parameters:**

- `T extends string` - Event type union (e.g., `"user.created.v1" | "order.placed.v1"`)
- `P extends Record<T, any>` - Payload map: `Record<EventType, PayloadType>`
- `M extends ClientID` - Client ID type (e.g., `"dashboard" | "auth"`)

**Example:**

```typescript
type Events = {
  'user.created.v1': { userId: string; email: string };
  'order.placed.v1': { orderId: string; amount: number };
};

const broker = new EventBroker<keyof Events, Events>();
```

---

### Methods

#### `sendTo()`

Send an event to a specific recipient (unicast).

```typescript
async sendTo<K extends T>(
  eventType: K,
  sender: M,
  recipient: ClientID,
  data: P[K],
  skipSync?: boolean
): Promise<EventResult>
```

**Parameters:**

- `eventType` - Type of event to send
- `sender` - Client ID of the sender
- `recipient` - Client ID of the recipient
- `data` - Event payload (must match type defined in `P[K]`)
- `skipSync` - Internal flag to prevent infinite loops in tab sync

**Returns:** `Promise<EventResult>`

- `status: 'ACK' | 'NACK'` - Delivery status
- `message: string` - Human-readable result message
- `timestamp: number` - Unix timestamp
- `clientId?: ClientID` - Recipient client ID (for unicast)

**Example:**

```typescript
// This method is called internally by clients
// Developers typically use client.dispatch() instead

// Internal usage by InMemoryClient:
const result = await broker.sendTo('user.created.v1', 'auth', 'dashboard', {
  userId: '123',
  email: 'user@example.com',
});

if (result.status === 'ACK') {
  console.log('Event delivered successfully');
} else {
  console.error('Delivery failed:', result.message);
}

// Recommended: Use client.dispatch() for application code
// See InMemoryClient section below
```

---

#### `broadcast()`

Broadcast an event to all subscribers except the sender.

```typescript
async broadcast<K extends T>(
  eventType: K,
  sender: M,
  data: P[K],
  skipSync?: boolean
): Promise<EventResult>
```

**Parameters:**

- `eventType` - Type of event to broadcast
- `sender` - Client ID of the sender (excluded from recipients)
- `data` - Event payload
- `skipSync` - Internal flag to prevent infinite loops in tab sync

**Returns:** `Promise<EventResult>`

**Example:**

```typescript
// This method is called internally by clients
// Developers typically use client.dispatch() instead

// Internal usage by InMemoryClient:
const result = await broker.broadcast('user.loggedOut.v1', 'auth', {
  userId: '123',
  timestamp: Date.now(),
});

console.log(`Broadcast sent to ${result.message}`);

// Recommended: Use client.dispatch() for application code
// See InMemoryClient section below
```

---

#### `subscribe()`

Subscribe a client to an event type.

```typescript
subscribe<K extends T>(
  clientId: ClientID,
  eventType: K,
  handler: Function
): void
```

**Parameters:**

- `clientId` - Unique client identifier
- `eventType` - Event type to subscribe to
- `handler` - Event handler function

**Example:**

```typescript
// This method is called internally by clients
// Developers typically use client.on() instead

// Internal usage:
broker.subscribe('dashboard', 'user.created.v1', (event) => {
  console.log('New user:', event.data);
});

// Recommended: Use client.on() for application code
// See InMemoryClient section below
```

---

#### `unsubscribe()`

Unsubscribe a client from an event type.

```typescript
unsubscribe<K extends T>(
  clientId: ClientID,
  eventType: K,
  handler?: Function
): void
```

---

#### `registerClient()`

Register a client instance in the broker's registry.

```typescript
registerClient(client: any): void
```

**Note:** Called automatically by client constructors.

---

#### `unregisterClient()`

Unregister a client and remove all its subscriptions.

```typescript
unregisterClient(clientId: ClientID): void
```

---

#### `getAllClients()`

Get all registered client instances.

```typescript
getAllClients(): any[]
```

**Returns:** Array of client instances

---

#### `getSubscribedClients()`

Get list of all clients that have active subscriptions.

```typescript
getSubscribedClients(): ClientID[]
```

**Returns:** Array of client IDs

---

#### `getSubscriptions()`

Get detailed subscription map for all clients.

```typescript
getSubscriptions(): Record<string, string[]>
```

**Returns:** Record mapping clientId to array of event types

**Example:**

```typescript
const subs = broker.getSubscriptions();
// {
//   "dashboard": ["user.created.v1", "order.placed.v1"],
//   "analytics": ["user.created.v1"]
// }
```

---

### Hooks

#### `useBeforeSendHook()`

Register a beforeSend hook. Called before each event is sent. Return `false` to block the event.

```typescript
useBeforeSendHook(hook: BeforeSendHook<T, P>): () => void
```

**Example:**

```typescript
const cleanup = broker.useBeforeSendHook((event) => {
  if (!hasPermission(event.source, event.type)) {
    console.warn('Access denied:', event);
    return false; // Block event
  }
  return true; // Allow event
});

// Later: cleanup();
```

---

#### `useAfterSendHook()`

Register an afterSend hook. Called after each event is sent.

```typescript
useAfterSendHook(hook: AfterSendHook<T, P>): () => void
```

**Example:**

```typescript
broker.useAfterSendHook((event, result) => {
  logger.info('Event sent', {
    type: event.type,
    success: result.success,
    handled: result.handled,
  });
});
```

---

#### `useOnSubscribeHandler()`

Register an onSubscribe hook. Called whenever a client subscribes to an event type.

```typescript
useOnSubscribeHandler(hook: OnSubscribeHandlerHook<T, M>): () => void
```

**Example:**

```typescript
broker.useOnSubscribeHandler((eventType, clientId) => {
  metrics.increment('subscriptions', { eventType, clientId });
});
```

---

#### `registerHooks()`

Register multiple EventBroker plugin hooks.

```typescript
registerHooks(hooks: EventBrokerHook<T, P, M>[]): () => void
```

**Example:**

```typescript
const myPlugin: EventBrokerHook = (broker) => {
  broker.useBeforeSendHook((event) => {
    console.log('Plugin: beforeSend', event.type);
    return true;
  });

  return () => {
    console.log('Plugin cleanup');
  };
};

broker.registerHooks([myPlugin]);
```

---

#### `destroy()`

Destroy the broker and clean up all resources.

```typescript
destroy(): void
```

**Example:**

```typescript
// On app shutdown
window.addEventListener('beforeunload', () => {
  broker.destroy();
});
```

---

## Clients

All clients implement the `Client` interface:

```typescript
interface Client<T extends string, P> {
  readonly id: ClientID;
  on<K extends T>(eventType: K, handler?: HandlerFn<K, P>): () => void;
  off<K extends T>(eventType: K, handler?: HandlerFn<K, P>): void;
  dispatch(recipient: ClientID | '*', eventType: T, data: P): Promise<EventResult>;
  destroy(): void;
}
```

---

## InMemoryClient

In-memory client for direct broker communication without transport overhead.

### Constructor

```typescript
new InMemoryClient<T, P, M>(
  id: M,
  broker: EventBroker<T, P, M>
)
```

**Parameters:**

- `id` - Unique client identifier
- `broker` - EventBroker instance

**Example:**

```typescript
const dashboard = new InMemoryClient('dashboard', broker);
```

---

### Methods

#### `on()`

Subscribe to event type with custom handler.

```typescript
on<K extends T>(eventType: K, handler: HandlerFn<K, P[K]>): () => void
```

**Note:** Handler is **required** for InMemoryClient (unlike transport clients).

**Example:**

```typescript
const unsubscribe = dashboard.on('user.created.v1', (event) => {
  console.log('User created:', event.data.userId);
});

// Later: unsubscribe();
```

---

#### `off()`

Unsubscribe from event type.

```typescript
off<K extends T>(eventType: K, handler?: HandlerFn<K, P[K]>): void
```

---

#### `dispatch()`

Dispatch event (unicast or broadcast).

```typescript
async dispatch(
  eventType: T,
  recipient: ClientID | '*',
  data: P
): Promise<EventResult>
```

**Example:**

```typescript
// Unicast - send to specific client
const result = await dashboard.dispatch('page.viewed.v1', 'analytics', {
  page: '/dashboard',
});

if (result.status === 'ACK') {
  console.log('Event delivered to analytics');
}

// Broadcast - send to all clients
await dashboard.dispatch('user.loggedOut.v1', '*', {
  userId: '123',
});
```

---

#### `sendTo()`

Send message to specific client (unicast).

```typescript
async sendTo<K extends T>(
  clientId: ClientID,
  eventType: K,
  data: P[K]
): Promise<EventResult>
```

---

#### `broadcast()`

Broadcast message to all clients (except sender).

```typescript
async broadcast<K extends T>(
  eventType: K,
  data: P[K]
): Promise<EventResult>
```

---

#### `destroy()`

Destroy client and cleanup all subscriptions.

```typescript
destroy(): void
```

---

## WebSocketClient

WebSocket transport client for real-time server communication.

### Constructor

```typescript
new WebSocketClient<T, P>(
  id: ClientID,
  broker: EventBroker<T, any, any>,
  ws: WebSocket
)
```

**Parameters:**

- `id` - Unique client identifier
- `broker` - EventBroker instance
- `ws` - Pre-configured WebSocket instance

**Example:**

```typescript
const ws = new WebSocket('wss://api.example.com');
const backend = new WebSocketClient('backend', broker, ws);
```

**Note:** WebSocket lifecycle (connection, reconnection, error handling) should be managed externally via infrastructure layer.

---

### Methods

#### `on()`

Subscribe to event type. Handler is internal - sends events to WebSocket.

```typescript
on<K extends T>(eventType: K): () => void
```

**Example:**

```typescript
backend.on('notification.received.v1');
```

---

#### `dispatch()`

Dispatch event (unicast or broadcast).

```typescript
async dispatch(
  recipient: ClientID | '*',
  eventType: T,
  data: P
): Promise<EventResult>
```

---

#### `destroy()`

Destroy client and cleanup.

```typescript
destroy(): void
```

---

## WorkerClient

Worker transport client for communication with Web Workers.

### Constructor

```typescript
new WorkerClient<T, P>(
  id: ClientID,
  broker: EventBroker<T, any, any>,
  worker: Worker
)
```

**Parameters:**

- `id` - Unique client identifier
- `broker` - EventBroker instance
- `worker` - Pre-configured Worker instance

**Example:**

```typescript
const worker = new Worker('./analytics-worker.js');
const analytics = new WorkerClient('analytics', broker, worker);
```

---

## PostMessageClient

PostMessage transport client for cross-frame communication.

### Constructor

```typescript
new PostMessageClient<T, P>(
  id: ClientID,
  broker: EventBroker<T, any, any>,
  targetWindow: Window,
  targetOrigin?: string
)
```

**Parameters:**

- `id` - Unique client identifier
- `broker` - EventBroker instance
- `targetWindow` - Target window object (iframe.contentWindow)
- `targetOrigin` - Target origin for security (default: `'*'`)

**Example:**

```typescript
const iframe = document.getElementById('widget') as HTMLIFrameElement;
const widget = new PostMessageClient(
  'widget',
  broker,
  iframe.contentWindow!,
  'https://widget.example.com',
);
```

---

## ServiceWorkerClient

Service Worker transport client for background task communication.

### Constructor

```typescript
new ServiceWorkerClient<T, P>(
  id: ClientID,
  broker: EventBroker<T, any, any>,
  serviceWorker: ServiceWorker
)
```

**Parameters:**

- `id` - Unique client identifier
- `broker` - EventBroker instance
- `serviceWorker` - Active ServiceWorker instance

**Example:**

```typescript
const registration = await navigator.serviceWorker.ready;
const sw = new ServiceWorkerClient('sw', broker, registration.active!);
```

---

## Types

### Event

CloudEvents v1.0 compliant event structure.

```typescript
interface Event<T extends string, P> {
  specversion: '1.0';
  type: T;
  source: string;
  id: string;
  time: string;
  datacontenttype: 'application/json';
  data: P;
  'mfe-recipient': ClientID | '*';
  'mfe-sessionid': string;
}
```

---

### EventResult

Result of event delivery.

```typescript
interface EventResult {
  status: 'ACK' | 'NACK';
  message: string;
  timestamp: number;
  clientId?: ClientID;
}
```

---

### ClientID

```typescript
type ClientID = string;
```

---

### HandlerFn

Event handler function type.

```typescript
type HandlerFn<K extends string, P> = (event: Event<K, P>) => void | Promise<void>;
```

---

### Hook Types

```typescript
type BeforeSendHook<T, P> = (event: Readonly<Event<T, P[T]>>) => boolean;

type AfterSendHook<T, P> = (
  event: Readonly<Event<T, P[T]>>,
  result: { success: boolean; handled: boolean },
) => void;

type OnSubscribeHandlerHook<T, M> = (eventType: T, clientId: M) => void;

type EventBrokerHook<T, P, M> = (broker: EventBroker<T, P, M>) => (() => void) | void;
```

---

## Best Practices

### 1. Type Safety

Always define your event types and payloads:

```typescript
type Events = {
  'user.created.v1': { userId: string; email: string };
  'user.updated.v1': { userId: string; changes: Partial<User> };
};

const broker = new EventBroker<keyof Events, Events>();
```

### 2. Error Handling

Always check EventResult status:

```typescript
const result = await client.dispatch('event.v1', '*', data);

if (result.status === 'NACK') {
  console.error('Event failed:', result.message);
  // Handle failure
}
```

### 3. Cleanup

Always cleanup subscriptions and clients:

```typescript
const unsubscribe = client.on('event.v1', handler);

// On component unmount
useEffect(() => {
  return () => {
    unsubscribe();
    client.destroy();
  };
}, []);
```

### 4. Hook Cleanup

Store cleanup functions from hooks:

```typescript
const cleanups: Array<() => void> = [];

cleanups.push(broker.useBeforeSendHook(hook1));
cleanups.push(broker.useAfterSendHook(hook2));

// On shutdown
cleanups.forEach((cleanup) => cleanup());
```

---

## See Also

- [Getting Started Guide](GETTING_STARTED.md)
- [Architecture Documentation](ARCHITECTURE.md)
- [Examples](EXAMPLES.md)
