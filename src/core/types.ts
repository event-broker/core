import type { EventBroker } from './EventBroker';

/** Уникальный идентификатор клиента в системе */
export type ClientID = string;

/**
 * CloudEvents v1.0 базовая структура
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
 * CloudEvents для микрофронтендов с расширениями
 * Это основной тип события в системе
 */
export interface MicrofrontendCloudEvent<T extends string = string, P = any> extends CloudEvent {
  type: T;
  data: P;

  // Microfrontend-specific extensions (должны начинаться с префикса)
  /** Target microfrontend ID or '*' for broadcast */
  'mfe-recipient': ClientID | '*';

  /** Original sender session ID  */
  'mfe-sessionid'?: string;
}

// Основной тип события - CloudEvents v1.0
export type Event<T extends string = string, P = any> = MicrofrontendCloudEvent<T, P>;

/**
 * Подпись обработчика: получает CloudEvent
 * Поддерживает автоматический ACK/NACK через Promise
 */
export type HandlerFn<T extends string, P = unknown> = (event: Event<T, P>) => void | Promise<void>;

/**
 * Единый результат отправки событий
 */
export interface EventResult {
  /** Статус: ACK = успешно, NACK = ошибка */
  status: 'ACK' | 'NACK';
  /** Описание результата */
  message: string;
  /** Время отправки */
  timestamp: number;
  /** ID целевого клиента (только для unicast) */
  clientId?: ClientID;
}

export type OnSubscribeHandlerHook<T, M extends ClientID> = (
  eventType: T,
  microfrontendID: M,
) => void;

export type BeforeSendHook<T extends string, P extends Record<T, any>> = (
  event: Readonly<Event<T, P[T]>>,
) => boolean;

export type AfterSendHook<T extends string, P extends Record<T, any>> = (
  event: Readonly<Event<T, P[T]>>,
  result: { success: boolean; handled: boolean },
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
 * Hook для EventBroker - позволяет подключить дополнительную функциональность
 *
 * @param broker - экземпляр EventBroker
 * @returns cleanup функция для отключения хука
 */
export type EventBrokerHook<T extends string, P extends Record<T, any>, C extends string> = (
  broker: any, // EventBroker<T, P, C> - avoid circular dependency
) => () => void;
