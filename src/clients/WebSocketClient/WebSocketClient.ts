import type { Client, Event, ClientID, EventResult } from '../../core/types';
import type { EventBroker } from '../../core/EventBroker';

/**
 * WebSocket broker client for real-time server communication
 *
 * Enables bidirectional, real-time communication with backend services
 * using WebSocket protocol. Ideal for live updates and server push.
 *
 * Use cases:
 * - Real-time notifications from backend
 * - Live data feeds (stock prices, chat messages)
 * - Server-initiated updates
 * - Bidirectional RPC-style communication
 *
 * @template T - Event type union
 * @template P - Payload type
 */
export class WebSocketClient<T extends string, P = any> implements Client<T, P> {
  static readonly clientType = 'WebSocketClient' as const;

  readonly id: ClientID;
  #broker: EventBroker<T, any, any>;
  #ws: WebSocket;

  constructor(id: ClientID, broker: EventBroker<T, any, any>, ws: WebSocket) {
    this.id = id;
    this.#broker = broker;
    this.#ws = ws;

    this.#broker.registerClient(this);
    this.#startListening();
  }

  /**
   * Subscribe to event type
   * Handler is internal - sends events to WebSocket
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
   * Handler for OUTGOING messages (app → WebSocket)
   */
  #handleOutgoing = (event: Event<T, P>): void => {
    if (this.#ws.readyState === 1) {
      // 1 = OPEN
      this.#ws.send(JSON.stringify(event));
    } else {
      console.warn(`[${this.id}] WebSocket not ready, message dropped`);
    }
  };

  /**
   * Handler for INCOMING messages (WebSocket → app)
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
    this.#ws.addEventListener('message', this.#handleIncoming);
  }

  #stopListening(): void {
    this.#ws.removeEventListener('message', this.#handleIncoming);
  }
}
