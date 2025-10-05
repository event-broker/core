import type { ClientID } from './types';

/**
 * Subscriptions - Efficient subscription and handler management
 *
 * Manages client subscriptions to events with O(1) lookups using bidirectional indexes:
 * - Event → Clients mapping for fast broadcast recipient lookup
 * - Client → Events mapping for fast unsubscribe operations
 * - Centralized handler storage with composite keys
 *
 * @internal This class is used internally by EventBroker
 */
export class Subscriptions<T extends string> {
  // ========================================
  // BIDIRECTIONAL INDEXES FOR O(1) OPERATIONS
  // ========================================

  /** Event → Clients mapping for fast broadcast recipient lookup */
  #subscriptions = new Map<T, Set<ClientID>>();

  /** Client → Events mapping for fast unsubscribe operations */
  #clientSubscriptions = new Map<ClientID, Set<T>>();

  /** Centralized handler storage with composite keys */
  #handlers = new Map<string, Function>();

  // ========================================
  // SUBSCRIPTION OPERATIONS
  // ========================================

  /**
   * Subscribe a client to an event type
   *
   * Maintains bidirectional indexes for O(1) lookups:
   * - Adds client to event's subscriber set
   * - Adds event to client's subscription set
   * - Stores handler with composite key
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type to subscribe to
   * @param handler - Event handler function
   */
  subscribe(clientId: ClientID, eventType: T, handler: Function): void {
    if (!this.#subscriptions.has(eventType)) {
      this.#subscriptions.set(eventType, new Set());
    }
    this.#subscriptions.get(eventType)!.add(clientId);

    if (!this.#clientSubscriptions.has(clientId)) {
      this.#clientSubscriptions.set(clientId, new Set());
    }
    this.#clientSubscriptions.get(clientId)!.add(eventType);

    const handlerKey = this.#getHandlerKey(clientId, eventType);
    this.#handlers.set(handlerKey, handler);
  }

  /**
   * Unsubscribe a client from an event type
   *
   * Removes the subscription and cleans up empty entries.
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type to unsubscribe from
   */
  unsubscribe(clientId: ClientID, eventType: T): void {
    this.#subscriptions.get(eventType)?.delete(clientId);
    this.#clientSubscriptions.get(clientId)?.delete(eventType);

    const handlerKey = this.#getHandlerKey(clientId, eventType);
    this.#handlers.delete(handlerKey);

    if (this.#subscriptions.get(eventType)?.size === 0) {
      this.#subscriptions.delete(eventType);
    }
  }

  /**
   * Unregister a client and remove all its subscriptions
   *
   * Efficiently removes all client subscriptions using the client → events index.
   * Time complexity: O(n) where n = number of client's subscriptions.
   *
   * @param clientId - Unique client identifier
   */
  unregisterClient(clientId: ClientID): void {
    const clientEvents = this.#clientSubscriptions.get(clientId);

    if (clientEvents) {
      for (const eventType of clientEvents) {
        this.#subscriptions.get(eventType)?.delete(clientId);

        if (this.#subscriptions.get(eventType)?.size === 0) {
          this.#subscriptions.delete(eventType);
        }

        const handlerKey = this.#getHandlerKey(clientId, eventType);
        this.#handlers.delete(handlerKey);
      }
    }

    this.#clientSubscriptions.delete(clientId);
  }

  // ========================================
  // QUERY OPERATIONS
  // ========================================

  /**
   * Check if a client is subscribed to an event type
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type to check
   * @returns True if subscribed, false otherwise
   */
  isSubscribed(clientId: ClientID, eventType: T): boolean {
    return this.#clientSubscriptions.get(clientId)?.has(eventType) ?? false;
  }

  /**
   * Get the handler for a specific client and event type
   *
   * @param clientId - Unique client identifier
   * @param eventType - Event type
   * @returns Handler function or undefined if not found
   */
  getHandler(clientId: ClientID, eventType: T): Function | undefined {
    const handlerKey = this.#getHandlerKey(clientId, eventType);
    return this.#handlers.get(handlerKey);
  }

  /**
   * Get all subscribers for an event type, excluding a specific client
   *
   * Used by broadcast() to get recipients (excluding the sender).
   *
   * @param eventType - Event type
   * @param excludeClientId - Client ID to exclude from results
   * @returns Set of client IDs (excluding the specified one)
   */
  getSubscribersExcept(eventType: T, excludeClientId: ClientID): Set<ClientID> {
    const subscribers = this.#getSubscribers(eventType);
    return new Set([...subscribers].filter((clientId) => clientId !== excludeClientId));
  }

  /**
   * Get list of all clients that have active subscriptions
   *
   * @returns Array of client IDs
   */
  getAllSubscribedClients(): ClientID[] {
    return Array.from(this.#clientSubscriptions.keys());
  }

  /**
   * Get detailed subscription map for all clients
   *
   * Used by observability tools and DevTools for inspection.
   *
   * @returns Record mapping clientId to array of subscribed event types
   */
  getAllSubscriptions(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [clientId, events] of this.#clientSubscriptions) {
      result[clientId] = Array.from(events);
    }
    return result;
  }

  // ========================================
  // LIFECYCLE
  // ========================================

  /**
   * Clear all subscriptions and handlers
   *
   * Called by EventBroker.destroy() to clean up all resources.
   */
  clear(): void {
    this.#subscriptions.clear();
    this.#clientSubscriptions.clear();
    this.#handlers.clear();
  }

  // ========================================
  // PRIVATE HELPERS
  // ========================================

  /**
   * Get all subscribers for an event type (internal use)
   * @private
   */
  #getSubscribers(eventType: T): Set<ClientID> {
    return this.#subscriptions.get(eventType) || new Set();
  }

  /**
   * Create composite key for handler storage
   * Format: "clientId:eventType"
   * @private
   */
  #getHandlerKey(clientId: ClientID, eventType: T): string {
    return `${clientId}:${eventType}`;
  }
}
