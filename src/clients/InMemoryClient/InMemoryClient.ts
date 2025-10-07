import type { EventBroker } from '../../core/EventBroker';
import type { ClientID, HandlerFn, EventResult, Client } from '../../core/types';

/**
 * In-memory client for direct broker communication without transport overhead
 *
 * This client provides the fastest event handling by working directly in memory
 * without any serialization or transport layer. Perfect for:
 * - Modular microfrontends in the same browsing context
 *
 * @template T - Event type union
 * @template P - Payload map
 * @template M - Client ID type
 */
export class InMemoryClient<T extends string, P extends Record<T, any>, M extends ClientID>
  implements Client<T, P[T]>
{
  static readonly clientType = 'InMemoryClient' as const;

  readonly id: M;
  #broker: EventBroker<T, P>;

  constructor(sender: M, broker: EventBroker<T, P>) {
    this.id = sender;
    this.#broker = broker;

    // Automatic registration in broker
    this.#broker.registerClient(this);
  }

  /**
   * Unified dispatch API (unicast or broadcast)
   */
  async dispatch<K extends T>(
    eventType: K,
    recipient: ClientID | '*',
    data: P[K],
  ): Promise<EventResult> {
    if (recipient === '*') {
      return this.#broker.broadcast(eventType, this.id, data);
    }
    return this.#broker.sendTo(eventType, this.id, recipient, data);
  }

  /**
   * Send message to specific client (Unicast)
   * Returns detailed delivery and handling information
   */
  async sendTo<K extends T>(clientId: ClientID, eventType: K, data: P[K]): Promise<EventResult> {
    return this.#broker.sendTo(eventType, this.id, clientId, data);
  }

  /**
   * Broadcast message to all clients (except sender)
   * Fire-and-forget approach with delivery confirmation
   */
  async broadcast<K extends T>(eventType: K, data: P[K]): Promise<EventResult> {
    return this.#broker.broadcast(eventType, this.id, data);
  }

  /**
   * Subscribe to event type with custom handler
   * Handler is required for InMemoryClient (unlike transport clients)
   *
   * Note: Only one handler per event type. Subsequent calls will replace the previous handler.
   */
  on<K extends T>(eventType: K, handler?: HandlerFn<K, P[K]>): () => void {
    if (!handler) {
      throw new Error('InMemoryClient requires explicit handler function');
    }
    // Delegate to broker - all routing logic lives there
    this.#broker.subscribe(this.id, eventType, handler);

    // Return unsubscribe function
    return () => {
      this.#broker.unsubscribe(this.id, eventType);
    };
  }

  /**
   * Unsubscribe from event type
   */
  off<K extends T>(eventType: K): void {
    this.#broker.unsubscribe(this.id, eventType);
  }

  /**
   * Destroy client and cleanup all subscriptions
   * Should be called in microfrontend unmount lifecycle
   */
  destroy(): void {
    console.log(`💥 Destroying InMemoryClient "${this.id}"`);

    // Unregister from broker (this also clears subscriptions and handlers)
    this.#broker.unregisterClient(this.id);

    console.log(`✅ InMemoryClient "${this.id}" destroyed`);
  }
}
