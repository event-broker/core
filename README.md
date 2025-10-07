<div align="center">
  <img src=".github/assets/mascote.png" alt="Event Broker Mascot" width="300" />
  
  # @event-broker/core

> Type-safe, CloudEvents-compliant event broker for microfrontend architectures

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![CloudEvents](https://img.shields.io/badge/CloudEvents-v1.0-green.svg)](https://cloudevents.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

**Event Broker** is a production-ready event communication system designed specifically for complex microfrontend architectures. It provides unified, type-safe event handling across multiple browser contexts, processes, and transport layers.

## ✨ Key Features

- 🎯 **Type-Safe** - Full TypeScript support with generic event types and payloads
- 🌐 **Universal Transport** - Single API for WebSocket, postMessage, Workers, Service Workers, and in-memory communication
- 📊 **CloudEvents v1.0** - CNCF standard compliance for enterprise integration
- 🔌 **Extensible** - Plugin system via hooks for custom logic (ACL, validation, etc)
- 🔄 **Auto Tab Sync** - Automatic cross-tab synchronization via BroadcastChannel
- ✅ **Delivery Confirmation** - ACK/NACK responses for reliable messaging
- 📦 **Zero Dependencies** - Lightweight core with optional plugins

## 🚀 Quick Start

### Installation

```bash
npm install @event-broker/core
```

### Basic Usage

```typescript
import { EventBroker, InMemoryClient } from '@event-broker/core';

// 1. Define your event types and payloads
type Events = {
  'user.created.v1': { userId: string; email: string };
  'order.placed.v1': { orderId: string; amount: number };
};

// 2. Create broker instance
const broker = new EventBroker<keyof Events, Events>();

// 3. Create client with unique name for some MFE
const client = new InMemoryClient('dashboard', broker);

// 4. Subscribe to events
client.on('user.created.v1', (event) => {
  console.log('New user:', event.data.userId);
});

// 5. Send events
await client.dispatch('user.created.v1', '*', {
  userId: '123',
  email: 'user@example.com',
});
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Event Broker                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Subscriptions│  │ HooksRegistry│  │   TabSync    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │ InMemory│      │WebSocket│      │  Worker │
   │ Client  │      │ Client  │      │ Client  │
   └─────────┘      └─────────┘      └─────────┘
```

### Core Components

- **EventBroker** - Central routing and lifecycle management
- **Clients** - Transport adapters (InMemory, WebSocket, Worker, PostMessage, ServiceWorker)
- **Subscriptions** - Efficient subscription management
- **HooksRegistry** - Extensibility system for plugins
- **TabSync** - Automatic cross-tab synchronization

## 🎯 Use Cases

### Microfrontend Communication

```typescript
// AppShell
const broker = new EventBroker();
const appShell = new InMemoryClient('appshell', broker);

// Dashboard MFE
const dashboard = new InMemoryClient('dashboard', broker);
dashboard.on('user.loggedIn.v1', (event) => {
  loadUserData(event.data.userId);
});

// Auth MFE
const auth = new InMemoryClient('auth', broker);
await auth.dispatch('user.loggedIn.v1', '*', { userId: '123' });
```

### WebSocket Backend Integration

```typescript
import { WebSocket } from './infrastructure/WebSocket'; // Your WebSocket wrapper

const ws = new WebSocket('wss://api.example.com');
const backend = new WebSocketClient('backend', broker, ws.socket);

// Subscribe to events from backend
backend.on('notification.received.v1');

// When backend sends an event, WebSocketClient automatically dispatches it to broker
// The dispatch() is called internally by WebSocketClient when receiving messages
```

### Request-Reply Pattern (Bidirectional Communication)

Event Broker supports **Request-Reply** pattern where handlers can return data back to the sender:

```typescript
// Setup: User Service responds with user data
userService.on('user.get.v1', async (event) => {
  const user = await database.getUser(event.data.userId);
  return user; // Return data to sender!
});

// Usage: Dashboard requests user data
const result = await dashboard.dispatch('user.get.v1', 'user-service', {
  userId: 123,
});

if (result.status === 'ACK') {
  console.log('User data:', result.data); // Access returned data
  // result.data = { id: 123, name: 'John', email: 'john@example.com' }
}
```

**Key Features:**

- ✅ No additional events needed (uses existing Promise chain)
- ✅ Type-safe responses
- ✅ Works with async handlers

**Example: Form Validation**

```typescript
// Validation Service
validationService.on('form.validate.v1', (event) => {
  const errors = validateEmail(event.data.email);
  return { valid: errors.length === 0, errors };
});

// Form Component
const result = await formClient.dispatch('form.validate.v1', 'validation-service', {
  email: 'user@example.com',
});

if (result.data.valid) {
  submitForm();
} else {
  showErrors(result.data.errors);
}
```

## 🔌 Ecosystem

- **[@event-broker/devtools](../mfe-event-devtools)** - React DevTools panel for debugging

## 📊 Performance

Benchmarks on MacBook Pro M1:

- **Throughput**: 22,000+ events/sec
- **Latency**: <0.05ms per event (in-memory)
- **Memory**: ~50KB base + ~100 bytes per subscription
- **Subscription lookup**: O(1)
- **Broadcast**: O(n) where n = number of subscribers

Run benchmarks:

```bash
npm run bench
```

## 🛠️ Advanced Features

### Hooks & Plugins

```typescript
// Create plugin with multiple hooks
const myPlugin = (broker) => {
  // Access control
  broker.useBeforeSendHook((event) => {
    if (!hasPermission(event.source, event.type)) {
      return false; // Block event
    }
    return true;
  });

  // Logging
  broker.useAfterSendHook((event, result) => {
    logger.info('Event sent', { event, result });
  });

  // Metrics
  broker.useOnSubscribeHandler((eventType, clientId) => {
    metrics.increment('subscriptions', { eventType, clientId });
  });

  // Return cleanup function
  return () => {
    console.log('Plugin cleanup');
  };
};

// Register plugin
broker.registerHooks([myPlugin]);
```

### DevTools Integration

```typescript
import { DevToolsManager } from '@event-broker/devtools';

const devtools = new DevToolsManager(broker);
devtools.mount('#devtools-root');
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 📝 License

MIT © 2024

## 🙏 Acknowledgments

- Built with [CloudEvents v1.0](https://cloudevents.io/) specification
- Designed for real-world microfrontend challenges at scale

---

**Need help?** Check out our [documentation](docs/) or open an [issue](https://github.com/your-org/event-broker/issues).
