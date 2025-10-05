import type { Client, Event, ClientID, EventResult } from '../../core/types';
import type { EventBroker } from '../../core/EventBroker';

/**
 * Service Worker broker  client for background task communication
 *
 * Enables communication with Service Workers for background processing,
 * push notifications, offline functionality, and background sync.
 *
 * Use cases:
 * - Push notification handling
 * - Background data synchronization
 * - Offline-first functionality
 * - Cache management
 * - Background fetch operations
 *
 * Key features:
 * - Runs in separate thread (non-blocking)
 * - Persists across page reloads
 * - Can wake up on push events
 * - Automatic JSON serialization
 *
 * @template T - Event type union
 * @template P - Payload type
 */
export class ServiceWorkerClient<T extends string, P = any> implements Client<T, P> {
  static readonly clientType = 'ServiceWorkerClient' as const;

  readonly id: ClientID;
  #broker: EventBroker<T, any, any>;
  #serviceWorker: ServiceWorker;

  constructor(id: ClientID, broker: EventBroker<T, any, any>, serviceWorker: ServiceWorker) {
    this.id = id;
    this.#broker = broker;
    this.#serviceWorker = serviceWorker;

    this.#broker.registerClient(this);
    this.#startListening();
  }

  /**
   * Subscribe to event type
   * Handler is internal - sends events to Service Worker
   */
  on<K extends T>(eventType: K): () => void {
    this.#broker.subscribe(this.id, eventType, this.#handleOutgoing);
    return () => this.#broker.unsubscribe(this.id, eventType);
  }

  /**
   * Unsubscribe from event type
   */
  off<K extends T>(eventType: K): void {
    this.#broker.unsubscribe(this.id, eventType);
  }

  /**
   * Dispatch event (unicast or broadcast)
   */
  async dispatch(eventType: T, recipient: ClientID | '*', data: P): Promise<EventResult> {
    if (recipient === '*') {
      return this.#broker.broadcast(eventType, this.id, data);
    }
    return this.#broker.sendTo(eventType, this.id, recipient, data);
  }

  /**
   * Destroy client and cleanup
   */
  destroy(): void {
    this.#stopListening();
    this.#broker.unregisterClient(this.id);
  }

  // ============================================
  // HANDLERS
  // ============================================

  /**
   * Handler for OUTGOING messages (app → Service Worker)
   */
  #handleOutgoing = (event: Event<T, P>): void => {
    this.#serviceWorker.postMessage(JSON.stringify(event));
  };

  /**
   * Handler for INCOMING messages (Service Worker → app)
   */
  #handleIncoming = (e: MessageEvent): void => {
    try {
      const event = JSON.parse(e.data);

      if (!event || !event.type) {
        console.warn(`[${this.id}] Invalid event format:`, event);
        return;
      }

      const recipient = event['mfe-recipient'] || '*';
      this.dispatch(event.type, recipient, event.data);
    } catch (error) {
      console.error(`[${this.id}] Failed to parse message:`, error);
    }
  };

  // ============================================
  // LIFECYCLE
  // ============================================

  #startListening(): void {
    // Service Worker messages come through navigator.serviceWorker
    navigator.serviceWorker.addEventListener('message', this.#handleIncoming);
  }

  #stopListening(): void {
    navigator.serviceWorker.removeEventListener('message', this.#handleIncoming);
  }
}
