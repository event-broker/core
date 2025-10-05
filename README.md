# @event-broker/core

> Type-safe, CloudEvents-compliant event broker for microfrontend architectures

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![CloudEvents](https://img.shields.io/badge/CloudEvents-v1.0-green.svg)](https://cloudevents.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Event Broker** is a production-ready, enterprise-grade event communication system designed specifically for complex microfrontend architectures. It provides unified, type-safe event handling across multiple browser contexts, processes, and transport layers.

## ✨ Key Features

- 🎯 **Type-Safe** - Full TypeScript support with generic event types and payloads
- 🌐 **Universal Transport** - Single API for WebSocket, postMessage, Workers, Service Workers, and in-memory communication
- 📊 **CloudEvents v1.0** - CNCF standard compliance for enterprise integration
- 🔌 **Extensible** - Plugin system via hooks for custom logic (ACL, validation, etc)
- ⚡ **High Performance** - 20,000+ events/sec with O(1) subscription lookups
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
const broker = new EventBroker<keyof Events, Events, string>();

// 3. Create client
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

## 📚 Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Step-by-step tutorial
- **[API Reference](docs/API.md)** - Complete API documentation
- **[Architecture](docs/ARCHITECTURE.md)** - System design and patterns
- **[Examples](docs/EXAMPLES.md)** - Real-world use cases

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Event Broker                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Subscriptions│  │ HooksRegistry│  │   TabSync    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
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
- **Subscriptions** - Efficient O(1) subscription management
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

// Subscribe to backend events
backend.on('notification.received.v1');

// Send to backend
await backend.dispatch('analytics.track.v1', 'backend', {
  event: 'page_view',
  page: '/dashboard',
});
```

### Web Worker Communication

```typescript
const worker = new Worker('./analytics-worker.js');
const analytics = new WorkerClient('analytics', broker, worker);

analytics.on('user.action.v1');

await analytics.dispatch('user.action.v1', 'analytics', {
  action: 'button_click',
  target: 'submit',
});
```

## 🔌 Ecosystem

- **[@event-broker/registry](../mfe-event-registry)** - Centralized type-safe event schema registry
- **[@event-broker/devtools](../mfe-event-devtools)** - React DevTools panel for debugging
- **[@event-broker/observability](../mfe-event-observability)** - Metrics, logging, and tracing

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
```

### Event Registry Integration

```typescript
import { eventRegistry } from '@event-broker/registry';

// Type-safe events from registry
type Events = typeof eventRegistry.events;
type EventTypes = keyof Events;

const broker = new EventBroker<EventTypes, Events, string>();
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

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📝 License

MIT © 2024

## 🙏 Acknowledgments

- Built with [CloudEvents v1.0](https://cloudevents.io/) specification
- Inspired by enterprise event-driven architectures
- Designed for real-world microfrontend challenges at scale

---

**Need help?** Check out our [documentation](docs/) or open an [issue](https://github.com/your-org/event-broker/issues).
