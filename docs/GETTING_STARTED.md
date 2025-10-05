# Getting Started with Event Broker

This guide will walk you through setting up and using `@event-broker/core` in your microfrontend application.

## Table of Contents

1. [Installation](#installation)
2. [Core Concepts](#core-concepts)
3. [Basic Setup](#basic-setup)
4. [Your First Event](#your-first-event)
5. [Working with Different Clients](#working-with-different-clients)
6. [Advanced Features](#advanced-features)
7. [Next Steps](#next-steps)

---

## Installation

Install the package via npm:

```bash
npm install @event-broker/core
```

Or with yarn:

```bash
yarn add @event-broker/core
```

---

## Core Concepts

Before diving in, let's understand the key concepts:

### EventBroker

The central hub that manages all event routing, subscriptions, and delivery. Think of it as a smart post office that knows how to deliver messages between different parts of your application.

### Clients

Adapters that connect your application components to the broker. Each client represents a communication endpoint:

- **InMemoryClient** - For components in the same browsing context (fastest)
- **WebSocketClient** - For backend communication
- **WorkerClient** - For Web Workers
- **PostMessageClient** - For iframes
- **ServiceWorkerClient** - For Service Workers

### Events

CloudEvents v1.0 compliant messages with:

- **Type** - Event identifier (e.g., `"user.created.v1"`)
- **Data** - Event payload
- **Metadata** - Source, timestamp, recipient, etc.

### Subscriptions

Registrations that tell the broker "I want to receive events of this type."

---

## Basic Setup

### Step 1: Define Your Event Types

Start by defining your event types and payloads in a central location:

```typescript
// src/events/types.ts
export type AppEvents = {
  'user.created.v1': {
    userId: string;
    email: string;
    name: string;
  };
  'user.updated.v1': {
    userId: string;
    changes: Partial<User>;
  };
  'user.deleted.v1': {
    userId: string;
  };
  'notification.show.v1': {
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    duration?: number;
  };
};

export type AppEventTypes = keyof AppEvents;
```

### Step 2: Create the Broker

Create a single broker instance for your application:

```typescript
// src/broker/createBroker.ts
import { EventBroker } from '@event-broker/core';
import type { AppEvents, AppEventTypes } from '../events/types';

export function createBroker() {
  return new EventBroker<AppEventTypes, AppEvents, string>();
}

// Create singleton instance
export const broker = createBroker();
```

### Step 3: Create Clients

Create clients for each part of your application:

```typescript
// src/broker/clients.ts
import { InMemoryClient } from '@event-broker/core';
import { broker } from './createBroker';

// AppShell client
export const appShellClient = new InMemoryClient('appshell', broker);

// Dashboard microfrontend client
export const dashboardClient = new InMemoryClient('dashboard', broker);

// Auth microfrontend client
export const authClient = new InMemoryClient('auth', broker);
```

---

## Your First Event

Let's create a complete example of sending and receiving an event.

### Scenario: User Login Flow

**Auth MFE** sends a login event → **Dashboard MFE** receives it and loads user data.

#### 1. Subscribe to Events (Dashboard)

```typescript
// dashboard/src/services/AuthListener.ts
import { dashboardClient } from '@/broker/clients';

export class AuthListener {
  private unsubscribe?: () => void;

  start() {
    // Subscribe to user login events
    this.unsubscribe = dashboardClient.on('user.created.v1', async (event) => {
      console.log('User logged in:', event.data.userId);

      // Load user data
      await this.loadUserData(event.data.userId);

      // Update UI
      this.updateUI(event.data);
    });

    console.log('✅ AuthListener started');
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      console.log('🛑 AuthListener stopped');
    }
  }

  private async loadUserData(userId: string) {
    // Your logic here
  }

  private updateUI(userData: any) {
    // Your logic here
  }
}
```

#### 2. Send Events (Auth)

```typescript
// auth/src/services/AuthService.ts
import { authClient } from '@/broker/clients';

export class AuthService {
  async login(email: string, password: string) {
    // Perform authentication
    const user = await this.authenticate(email, password);

    // Notify all microfrontends about successful login
    const result = await authClient.dispatch('user.created.v1', '*', {
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    if (result.status === 'ACK') {
      console.log('✅ Login event sent successfully');
    } else {
      console.error('❌ Login event failed:', result.message);
    }

    return user;
  }

  private async authenticate(email: string, password: string) {
    // Your authentication logic
  }
}
```

#### 3. Initialize in Your App

```typescript
// dashboard/src/main.ts
import { AuthListener } from './services/AuthListener';

const authListener = new AuthListener();
authListener.start();

// Cleanup on unmount
window.addEventListener('beforeunload', () => {
  authListener.stop();
});
```

---

## Working with Different Clients

### InMemoryClient (Modular Microfrontends)

Best for components in the same browsing context.

```typescript
import { InMemoryClient } from '@event-broker/core';

const client = new InMemoryClient('my-service', broker);

// Subscribe with custom handler
client.on('event.type.v1', (event) => {
  console.log('Received:', event.data);
});

// Send events
await client.dispatch('event.type.v1', '*', { foo: 'bar' });
```

### WebSocketClient (Backend Integration)

For real-time communication with backend services.

```typescript
import { WebSocketClient } from '@event-broker/core';

// 1. Create WebSocket connection (with reconnect logic)
class ReconnectingWebSocket {
  socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.setupReconnect();
  }

  private setupReconnect() {
    this.socket.onclose = () => {
      setTimeout(() => {
        this.socket = new WebSocket(this.socket.url);
        this.setupReconnect();
      }, 3000);
    };
  }
}

// 2. Create client
const ws = new ReconnectingWebSocket('wss://api.example.com');
const backend = new WebSocketClient('backend', broker, ws.socket);

// 3. Subscribe to backend events
backend.on('notification.received.v1');

// 4. Send to backend
await backend.dispatch('analytics.track.v1', 'backend', {
  event: 'page_view',
  page: '/dashboard',
});
```

### WorkerClient (Web Workers)

For offloading heavy computations.

```typescript
import { WorkerClient } from '@event-broker/core';

// 1. Create worker
const worker = new Worker('./analytics-worker.js');

// 2. Create client
const analytics = new WorkerClient('analytics', broker, worker);

// 3. Subscribe to worker events
analytics.on('analytics.result.v1');

// 4. Send to worker
await analytics.dispatch('analytics.process.v1', 'analytics', {
  data: largeDataset,
});
```

### PostMessageClient (iframes)

For cross-origin iframe communication.

```typescript
import { PostMessageClient } from '@event-broker/core';

// 1. Get iframe reference
const iframe = document.getElementById('widget') as HTMLIFrameElement;

// 2. Create client with origin validation
const widget = new PostMessageClient(
  'widget',
  broker,
  iframe.contentWindow!,
  'https://widget.example.com', // Security: specify exact origin
);

// 3. Subscribe to iframe events
widget.on('widget.action.v1');

// 4. Send to iframe
await widget.dispatch('widget.config.v1', 'widget', {
  theme: 'dark',
  locale: 'en',
});
```

### ServiceWorkerClient (Service Workers)

For background tasks and push notifications.

```typescript
import { ServiceWorkerClient } from '@event-broker/core';

// 1. Get Service Worker
const registration = await navigator.serviceWorker.ready;

// 2. Create client
const sw = new ServiceWorkerClient('sw', broker, registration.active!);

// 3. Subscribe to SW events
sw.on('push.notification.v1');

// 4. Send to SW
await sw.dispatch('cache.clear.v1', 'sw', {
  cacheNames: ['api-cache'],
});
```

---

## Advanced Features

### 1. Unicast vs Broadcast

```typescript
// Broadcast - send to ALL subscribers (except sender)
await client.dispatch('user.loggedOut.v1', '*', { userId: '123' });

// Unicast - send to SPECIFIC client
await client.dispatch('page.viewed.v1', 'analytics', { page: '/home' });
```

### 2. Delivery Confirmation

```typescript
const result = await client.dispatch('event.v1', '*', { data: 'test' });

if (result.status === 'ACK') {
  console.log('✅ Delivered:', result.message);
} else {
  console.error('❌ Failed:', result.message);
  // Handle failure (retry, log, alert user)
}
```

### 3. Hooks for Cross-Cutting Concerns

#### Access Control

```typescript
broker.useBeforeSendHook((event) => {
  // Check permissions
  if (!hasPermission(event.source, event.type)) {
    console.warn('Access denied:', event.type);
    return false; // Block event
  }
  return true; // Allow event
});
```

#### Logging

```typescript
broker.useAfterSendHook((event, result) => {
  logger.info('Event sent', {
    type: event.type,
    source: event.source,
    success: result.success,
    timestamp: event.time,
  });
});
```

#### Metrics

```typescript
broker.useOnSubscribeHandler((eventType, clientId) => {
  metrics.increment('event_subscriptions', {
    event_type: eventType,
    client_id: clientId,
  });
});
```

### 4. React Integration

```typescript
// Custom hook for event subscriptions
import { useEffect } from 'react';
import { dashboardClient } from '@/broker/clients';

export function useEventSubscription<K extends AppEventTypes>(
  eventType: K,
  handler: (event: Event<K, AppEvents[K]>) => void,
) {
  useEffect(() => {
    const unsubscribe = dashboardClient.on(eventType, handler);
    return unsubscribe;
  }, [eventType, handler]);
}

// Usage in component
function UserProfile() {
  useEventSubscription('user.updated.v1', (event) => {
    console.log('User updated:', event.data);
    // Update local state
  });

  return <div>Profile</div>;
}
```

### 5. Error Handling

```typescript
try {
  const result = await client.dispatch('risky.event.v1', '*', data);

  if (result.status === 'NACK') {
    // Handle NACK (no subscribers, blocked by hook, etc.)
    console.warn('Event not delivered:', result.message);
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Event dispatch failed:', error);
}
```

---

## Best Practices

### 1. Event Naming Convention

Use semantic versioning in event names:

```typescript
// ✅ Good
'user.created.v1';
'order.placed.v2';
'notification.sent.v1';

// ❌ Bad
'userCreated';
'ORDER_PLACED';
'notification';
```

### 2. Type Safety

Always define event types upfront:

```typescript
// ✅ Good - Type-safe
type Events = {
  'user.created.v1': { userId: string };
};
const broker = new EventBroker<keyof Events, Events, string>();

// ❌ Bad - No type safety
const broker = new EventBroker<string, any, string>();
```

### 3. Cleanup

Always cleanup subscriptions:

```typescript
// ✅ Good
const unsubscribe = client.on('event.v1', handler);
// Later...
unsubscribe();

// ❌ Bad - Memory leak
client.on('event.v1', handler);
// Never cleaned up
```

### 4. Single Broker Instance

Use a singleton broker:

```typescript
// ✅ Good
export const broker = new EventBroker();

// ❌ Bad - Multiple brokers won't communicate
const broker1 = new EventBroker();
const broker2 = new EventBroker();
```

### 5. Error Boundaries

Wrap event handlers in try-catch:

```typescript
client.on('event.v1', async (event) => {
  try {
    await processEvent(event.data);
  } catch (error) {
    console.error('Handler error:', error);
    // Don't let one handler crash others
  }
});
```

---

## Troubleshooting

### Events Not Received

1. **Check subscription**: Is the client subscribed?

   ```typescript
   const subs = broker.getSubscriptions();
   console.log(subs);
   ```

2. **Check client registration**: Is the client registered?

   ```typescript
   const clients = broker.getAllClients();
   console.log(clients);
   ```

3. **Check event type**: Exact match required
   ```typescript
   // ❌ Won't match
   client.on('user.created.v1', handler);
   await sender.dispatch('user.created.v2', '*', data); // Different version!
   ```

### NACK Responses

Common reasons for NACK:

1. **No subscribers**: No one is listening to this event type
2. **Blocked by hook**: `beforeSend` hook returned `false`
3. **Handler error**: Subscriber's handler threw an error

### Performance Issues

1. **Too many subscriptions**: Use `getSubscriptions()` to audit
2. **Heavy handlers**: Move to Web Worker
3. **Large payloads**: Consider pagination or streaming

---

## Next Steps

Now that you understand the basics, explore:

1. **[API Reference](API.md)** - Complete API documentation
2. **[Architecture](ARCHITECTURE.md)** - Deep dive into system design
3. **[Examples](EXAMPLES.md)** - Real-world patterns and recipes
4. **[DevTools](../../mfe-event-devtools/README.md)** - Debug your events
5. **[Event Registry](../../mfe-event-registry/README.md)** - Centralized schema management
6. **[Observability](../../mfe-event-observability/README.md)** - Metrics and monitoring

---

## Need Help?

- 📖 [Documentation](../README.md)
- 🐛 [Report Issues](https://github.com/your-org/event-broker/issues)
- 💬 [Discussions](https://github.com/your-org/event-broker/discussions)

Happy coding! 🚀
