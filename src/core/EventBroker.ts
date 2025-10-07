import type { Event, ClientID, EventBrokerHook } from './types';
import type { EventResult } from './types';
import type { OnSubscribeHandlerHook, BeforeSendHook, AfterSendHook } from './types';
import { HooksRegistry } from '../hooks/HooksRegistry';
import { TabSync } from './TabSync';
import { Subscriptions } from './Subscriptions';
import { deepFreeze } from '../utils/deepFreeze';

/**
 * EventBroker - Core event routing and lifecycle management
 *
 * - Type-safe event delivery (unicast & broadcast)
 * - CloudEvents v1.0 compliance
 * - Cross-tab synchronization via BroadcastChannel
 * - Extensible hook system for observability and plugins
 * - ACK/NACK delivery confirmation
 *
 * @template T - Event type union (e.g., "user.created.v1" | "order.placed.v1")
 * @template P - Payload map: Record<EventType, PayloadType>
 */
export class EventBroker<T extends string, P extends Record<T, any>> {
  #sessionId = Math.random().toString(36).substring(2);
  #hooks = new HooksRegistry<T, P>();
  #tabSync = new TabSync<T, P>(this.#sessionId, (event) => this.#handleTabSyncedEvent(event));
  #subscriptions = new Subscriptions<T>();
  #registeredClients = new Map<ClientID, any>();

  // ========================================
  // SUBSCRIPTION MANAGEMENT
  // ========================================

  /**
   * Subscribe a client to an event type
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type to subscribe to
   * @param handler - Event handler function
   */
  subscribe<K extends T>(clientId: ClientID, eventType: K, handler: Function): void {
    this.#subscriptions.subscribe(clientId, eventType, handler);
    this.#hooks.onSubscribe(eventType, clientId);
  }

  /**
   * Unsubscribe a client from an event type
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type to unsubscribe from
   */
  unsubscribe<K extends T>(clientId: ClientID, eventType: K): void {
    this.#subscriptions.unsubscribe(clientId, eventType);
  }

  // ========================================
  // EVENT DELIVERY
  // ========================================

  /**
   * Send an event to a specific recipient (unicast)
   *
   * Returns ACK if the event was delivered and handled successfully,
   * NACK if the recipient is not subscribed or the handler failed.
   *
   * @param eventType - Type of event to send
   * @param sender - Client ID of the sender
   * @param recipient - Client ID of the recipient
   * @param data - Event payload (must match the type defined in P[K])
   * @param skipSync - Internal flag to prevent infinite loops in tab sync
   * @returns Promise resolving to EventResult with status (ACK/NACK)
   */
  async sendTo<K extends T>(
    eventType: K,
    sender: ClientID,
    recipient: ClientID,
    data: P[K],
    skipSync = false,
  ): Promise<EventResult> {
    const event = this.#createEvent(eventType, sender, recipient, data);

    // Guard 1: Check if beforeSend hook blocks the event
    if (!this.#hooks.beforeSend(deepFreeze(event))) {
      const result = this.#createResult('NACK', 'Event blocked by beforeSend hook', recipient);
      this.#hooks.afterSend(deepFreeze(event), result);
      return result;
    }

    // Guard 2: Verify recipient subscription
    if (!this.#subscriptions.isSubscribed(recipient, eventType)) {
      const result = this.#createResult(
        'NACK',
        `Client '${recipient}' not subscribed to '${eventType}'`,
        recipient,
      );
      this.#hooks.afterSend(deepFreeze(event), result);
      return result;
    }

    // Execute handler and get response data (for Request-Reply pattern)
    const handler = this.#subscriptions.getHandler(recipient, eventType);
    const { success, data: responseData } = await this.#executeHandler(event, handler);

    // Build result with optional response data
    const result = this.#createResult(
      success ? 'ACK' : 'NACK',
      success
        ? `Event delivered and handled by '${recipient}'`
        : `Event not handled by '${recipient}'`,
      recipient,
      responseData,
    );

    // Post-processing - pass full EventResult to hooks
    this.#hooks.afterSend(deepFreeze(event), result);
    if (!skipSync) {
      this.#tabSync.sync(event);
    }

    return result;
  }

  /**
   * Broadcast an event to all subscribers except the sender
   *
   * Sends the event to all subscribed clients in a fire-and-forget manner.
   * Returns ACK if there are subscribers, NACK if no one is subscribed.
   * Individual handler failures are logged but don't affect the result.
   *
   * @param eventType - Type of event to broadcast
   * @param sender - Client ID of the sender (excluded from recipients)
   * @param data - Event payload (must match the type defined in P[K])
   * @param skipSync - Internal flag to prevent infinite loops in tab sync
   * @returns Promise resolving to EventResult with status (ACK/NACK)
   */
  async broadcast<K extends T>(
    eventType: K,
    sender: ClientID,
    data: P[K],
    skipSync = false,
  ): Promise<EventResult> {
    const event = this.#createEvent(eventType, sender, '*', data);

    // Guard 1: Check if beforeSend hook blocks the event
    if (!this.#hooks.beforeSend(deepFreeze(event))) {
      const result = this.#createResult('NACK', 'Broadcast blocked by beforeSend hook');
      this.#hooks.afterSend(deepFreeze(event), result);
      return result;
    }

    // Guard 2: Verify there are subscribers
    const recipients = this.#subscriptions.getSubscribersExcept(eventType, sender);
    if (recipients.size === 0) {
      const result = this.#createResult('NACK', `No subscribers for event '${eventType}'`);
      this.#hooks.afterSend(deepFreeze(event), result);
      return result;
    }

    // Fire-and-forget delivery to all recipients
    for (const clientId of recipients) {
      const handler = this.#subscriptions.getHandler(clientId, eventType);
      if (handler) {
        try {
          Promise.resolve(handler(event)).catch((handlerError: unknown) => {
            console.error(`❌ Handler failed for client ${clientId}:`, handlerError);
          });
        } catch (handlerError: unknown) {
          console.error(`❌ Handler failed for client ${clientId}:`, handlerError);
        }
      }
    }

    // Build result
    const result = this.#createResult(
      'ACK',
      `Broadcast sent to ${recipients.size} subscriber${recipients.size === 1 ? '' : 's'}`,
    );

    // Post-processing - pass full EventResult
    this.#hooks.afterSend(deepFreeze(event), result);
    if (!skipSync) {
      this.#tabSync.sync(event);
    }

    return result;
  }

  // ========================================
  // CLIENT REGISTRY & OBSERVABILITY
  // ========================================

  /**
   * Register a client instance in the broker's registry
   *
   * Used internally by client constructors. Allows DevTools and
   * observability plugins to track all active clients.
   *
   * @param client - Client instance to register
   * @internal
   */
  registerClient(client: any): void {
    this.#registeredClients.set(client.id, client);
  }

  /**
   * Unregister a client and remove all its subscriptions
   *
   * Cleans up all resources associated with a client. Called when
   * a client is destroyed or disconnected.
   *
   * @param clientId - Unique client identifier
   * @internal
   */
  unregisterClient(clientId: ClientID): void {
    this.#registeredClients.delete(clientId);
    this.#subscriptions.unregisterClient(clientId);
  }

  /**
   * Get all registered client instances
   *
   * Used by DevTools and observability plugins to inspect
   * the current state of all clients.
   *
   * @returns Array of client instances
   * @public
   */
  getAllClients(): any[] {
    return Array.from(this.#registeredClients.values());
  }

  /**
   * Get list of all clients that have active subscriptions
   *
   * @returns Array of client IDs
   * @public
   */
  getSubscribedClients(): ClientID[] {
    return this.#subscriptions.getAllSubscribedClients();
  }

  /**
   * Get detailed subscription map for all clients
   *
   * Returns a map where keys are client IDs and values are
   * arrays of event types they're subscribed to.
   *
   * @returns Record mapping clientId to array of event types
   */
  getSubscriptions(): Record<string, string[]> {
    return this.#subscriptions.getAllSubscriptions();
  }

  // ========================================
  // HOOKS & EXTENSIBILITY
  // ========================================

  /**
   * Register a beforeSend hook
   *
   * Called before each event is sent. Return false to block the event.
   * Useful for implementing access control, rate limiting, or validation.
   *
   * @param hook - Function called before each send operation
   * @returns Cleanup function to remove the hook
   */
  useBeforeSendHook(hook: BeforeSendHook<T, P>): () => void {
    return this.#hooks.addBeforeSendEvent(hook);
  }

  /**
   * Register an afterSend hook
   *
   * Called after each event is sent. Receives the event and delivery result.
   * Useful for logging, metrics, or triggering side effects.
   *
   * @param hook - Function called after each send operation
   * @returns Cleanup function to remove the hook
   */
  useAfterSendHook(hook: AfterSendHook<T, P>): () => void {
    return this.#hooks.addAfterSendEvent(hook);
  }

  /**
   * Register an onSubscribe hook
   *
   * Called whenever a client subscribes to an event type.
   * Useful for tracking active subscriptions or auditing.
   *
   * @param hook - Function called on each subscription
   * @returns Cleanup function to remove the hook
   */
  useOnSubscribeHandler(hook: OnSubscribeHandlerHook<T>): () => void {
    return this.#hooks.addOnSubscribeHandler(hook);
  }

  /**
   * Register multiple EventBroker hooks (plugins)
   *
   * Convenience method for registering plugins that need full broker access.
   * Each hook receives the broker instance and returns a cleanup function.
   *
   * @param hooks - Array of EventBrokerHook functions
   * @returns Cleanup function to remove all registered hooks
   */
  registerHooks(hooks: EventBrokerHook<T, P>[]): () => void {
    return this.#hooks.registerEventBrokerHooks(hooks, this);
  }

  // ========================================
  // LIFECYCLE & CLEANUP
  // ========================================

  /**
   * Destroy the broker and clean up all resources
   *
   * - Closes cross-tab synchronization
   * - Removes all subscriptions and handlers
   * - Clears registered clients
   *
   * Call this when shutting down the application or microfrontend.
   */
  destroy(): void {
    this.#tabSync.destroy();
    this.#subscriptions.clear();
    this.#registeredClients.clear();
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Handle events received from other browser tabs
   * Routes the event to sendTo() or broadcast() with skipSync flag
   * @private
   */
  #handleTabSyncedEvent(event: Event<T, P[T]>): void {
    const recipient = event['mfe-recipient'];
    const eventType = event.type;
    const sender = event.source;
    const data = event.data;

    if (recipient !== '*') {
      this.sendTo(eventType, sender, recipient, data, true);
    } else {
      this.broadcast(eventType, sender, data, true);
    }
  }

  /**
   * Create a CloudEvents v1.0 compliant event
   * @private
   */
  #createEvent<K extends T>(
    eventType: K,
    sender: ClientID,
    recipient: ClientID | '*',
    data: P[K],
  ): Event<K, P[K]> {
    return {
      specversion: '1.0',
      type: eventType,
      source: sender,
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data,
      'mfe-recipient': recipient,
      'mfe-sessionid': this.#sessionId,
    };
  }

  /**
   * Create an EventResult object
   * @private
   */
  #createResult(
    status: 'ACK' | 'NACK',
    message: string,
    clientId?: ClientID,
    data?: any,
  ): EventResult {
    return {
      status,
      message,
      timestamp: Date.now(),
      ...(clientId && { clientId }),
      ...(data !== undefined && { data }),
    };
  }

  /**
   * Execute a handler with error handling
   * @returns Object with success status and optional response data
   * @private
   */
  async #executeHandler(
    event: Event<T, P[T]>,
    handler: Function | undefined,
  ): Promise<{
    success: boolean;
    data?: any;
  }> {
    if (!handler) return { success: false };

    try {
      const result = await handler(event);
      return { success: true, data: result };
    } catch (handlerError) {
      console.error(`❌ Handler failed:`, handlerError);
      return { success: false };
    }
  }
}
