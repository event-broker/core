import type { EventBroker } from './EventBroker';

/** Unique client identifier in the system */
export type ClientID = string;

/**
 * CloudEvents v1.0 base structure
 * @see https://cloudevents.io/
 */
export interface CloudEvent {
  /** CloudEvents specification version (REQUIRED) */
  specversion: '1.0';

  /** Event type (REQUIRED) */
  type: string;

  /** Event source (REQUIRED) */
  source: string;

  /** Unique event identifier (REQUIRED) */
  id: string;

  /** Event timestamp in ISO 8601 format (OPTIONAL) */
  time?: string;

  /** MIME type of data value (OPTIONAL) */
  datacontenttype?: string;

  /** Event payload (OPTIONAL) */
  data?: any;
}

/**
 * CloudEvents for microfrontends with custom extensions
 * This is the main event type used throughout the system
 */
export interface MicrofrontendCloudEvent<T extends string = string, P = any> extends CloudEvent {
  type: T;
  data: P;

  // Microfrontend-specific extensions (must start with prefix)
  /** Target microfrontend ID or '*' for broadcast */
  'mfe-recipient': ClientID | '*';

  /** Original sender session ID */
  'mfe-sessionid'?: string;
}

// Main event type - CloudEvents v1.0 compliant
export type Event<T extends string = string, P = any> = MicrofrontendCloudEvent<T, P>;

/**
 * Event handler function signature: receives CloudEvent
 * Supports automatic ACK/NACK via Promise resolution
 *
 * Can return data for Request-Reply pattern:
 * - void/Promise<void> - Standard event handler (fire-and-forget)
 * - any/Promise<any> - Query handler with response data
 */
export type HandlerFn<T extends string, P = unknown> = (
  event: Event<T, P>,
) => void | any | Promise<void | any>;

/**
 * Unified result of event dispatch operation
 *
 * For Request-Reply pattern, may contain response data:
 * - status: 'ACK' + data - Successful request with response data
 * - status: 'ACK' without data - Successful event/command (no response)
 * - status: 'NACK' - Delivery or processing failure
 */
export interface EventResult<TResponse = any> {
  /** Status: ACK = success, NACK = failure */
  status: 'ACK' | 'NACK';
  /** Human-readable result description */
  message: string;
  /** Timestamp of dispatch operation */
  timestamp: number;
  /** Target client ID (only for unicast) */
  clientId?: ClientID;
  /** Response data from handler (for Request-Reply pattern) */
  data?: TResponse;
}

export type OnSubscribeHandlerHook<T> = (eventType: T, clientID: ClientID) => void;

export type BeforeSendHook<T extends string, P extends Record<T, any>> = (
  event: Readonly<Event<T, P[T]>>,
) => boolean;

export type AfterSendHook<T extends string, P extends Record<T, any>> = (
  event: Readonly<Event<T, P[T]>>,
  eventResult: EventResult,
) => void;

/**
 * Unified Client interface - All clients use same subscription model
 * Both InMemoryClient and Transport clients implement on/off with handlers
 */
export interface Client<T extends string = string, P = any> {
  /** Unique client identifier */
  readonly id: ClientID;

  /**
   * Unified dispatch API for sending events
   * - recipient = clientId → unicast via broker.sendTo
   * - recipient = '*'       → broadcast via broker.broadcast
   */
  dispatch<K extends T>(
    eventType: K,
    recipient: ClientID | '*',
    data: P extends Record<T, any> ? P[K] : any,
  ): Promise<EventResult>;

  /** Subscribe to event type with handler (delegates to broker) */
  on<K extends T>(eventType: K, handler?: HandlerFn<K, P>): void;

  /** Unsubscribe from event type */
  off<K extends T>(eventType: K, handler?: HandlerFn<K, P>): void;

  /** Destroy client resources and close communication channels */
  destroy?(): void;
}

// =============================================================================
// 🪝 Event Broker Hooks
// =============================================================================

/**
 * EventBroker hook function - enables pluggable functionality
 *
 * Hooks receive the broker instance and can register custom logic for:
 * - Access control and validation
 * - Logging and observability
 * - Metrics and monitoring
 * - Custom event processing
 *
 * @param broker - EventBroker instance
 * @returns Cleanup function to unregister the hook
 *
 * @example
 * ```typescript
 * const loggingHook: EventBrokerHook = (broker) => {
 *   const cleanup = broker.useAfterSendHook((event) => {
 *     console.log('Event sent:', event.type);
 *   });
 *   return cleanup;
 * };
 * ```
 */
export type EventBrokerHook<T extends string, P extends Record<T, any>> = (
  broker: any, // EventBroker<T, P> - avoid circular dependency
) => () => void;
