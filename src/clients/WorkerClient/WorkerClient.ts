import type { Client, Event, ClientID, EventResult } from '../../core/types';
import type { EventBroker } from '../../core/EventBroker';

/**
 * Worker transport client for communication with Web Workers
 *
 * Accepts a pre-configured Worker instance for bidirectional event flow.
 */
export class WorkerClient<T extends string, P = any> implements Client<T, P> {
  static readonly clientType = 'WorkerClient' as const;

  readonly id: ClientID;
  #broker: EventBroker<T, any, any>;
  #worker: Worker;

  constructor(id: ClientID, broker: EventBroker<T, any, any>, worker: Worker) {
    this.id = id;
    this.#broker = broker;
    this.#worker = worker;

    this.#broker.registerClient(this);
    this.#startListening();
  }

  /**
   * Subscribe to event type
   * Handler is internal - sends events to Worker
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
   * Handler for OUTGOING messages (app → Worker)
   */
  #handleOutgoing = (event: Event<T, P>): void => {
    this.#worker.postMessage(JSON.stringify(event));
  };

  /**
   * Handler for INCOMING messages (Worker → app)
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
    this.#worker.addEventListener('message', this.#handleIncoming);
  }

  #stopListening(): void {
    this.#worker.removeEventListener('message', this.#handleIncoming);
    this.#worker.terminate();
  }
}
