import type { Client, Event, ClientID, EventResult } from '../../core/types';
import type { EventBroker } from '../../core/EventBroker';

/**
 * PostMessage transport client for cross-frame communication
 *
 * Enables communication with iframes and popup windows using the
 * window.postMessage API. Supports origin validation for security.
 *
 * Use cases:
 * - Communication with cross-origin iframes
 * - Popup window integration
 * - Embedded third-party widgets
 *
 * Security features:
 * - Origin validation (configurable via targetOrigin)
 * - Source window verification
 * - Automatic JSON serialization/deserialization
 *
 * @template T - Event type union
 * @template P - Payload type
 */
export class PostMessageClient<T extends string, P = any> implements Client<T, P> {
  static readonly clientType = 'PostMessageClient' as const;

  readonly id: ClientID;
  #broker: EventBroker<T, any>;
  #targetWindow: Window;
  #targetOrigin: string;

  constructor(
    id: ClientID,
    broker: EventBroker<T, any>,
    targetWindow: Window,
    targetOrigin: string = '*',
  ) {
    this.id = id;
    this.#broker = broker;
    this.#targetWindow = targetWindow;
    this.#targetOrigin = targetOrigin;

    this.#broker.registerClient(this);
    this.#startListening();
  }

  /**
   * Subscribe to event type
   * Handler is internal - sends events via postMessage
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
   * Handler for OUTGOING messages (app → iframe)
   */
  #handleOutgoing = (event: Event<T, P>): void => {
    try {
      this.#targetWindow.postMessage(event, this.#targetOrigin);
    } catch (error) {
      console.error(`[${this.id}] postMessage failed:`, error);
    }
  };

  /**
   * Handler for INCOMING messages (iframe → app)
   */
  #handleIncoming = (e: MessageEvent): void => {
    // Only process messages from our target window
    if (e.source !== this.#targetWindow) {
      return;
    }

    // Check origin for security
    if (this.#targetOrigin !== '*' && e.origin !== this.#targetOrigin) {
      return;
    }

    try {
      const event = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

      if (!event || !event.type) {
        console.warn(`[${this.id}] Invalid event format:`, event);
        return;
      }

      const recipient = event['mfe-recipient'] || '*';
      this.dispatch(event.type, recipient, event.data);
    } catch (error) {
      console.error(`[${this.id}] Failed to handle message:`, error);
    }
  };

  // ============================================
  // LIFECYCLE
  // ============================================

  #startListening(): void {
    window.addEventListener('message', this.#handleIncoming);
  }

  #stopListening(): void {
    window.removeEventListener('message', this.#handleIncoming);
  }
}
