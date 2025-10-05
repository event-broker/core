import { HookCollection } from './HookCollection';
import type {
  OnSubscribeHandlerHook,
  BeforeSendHook,
  AfterSendHook,
  EventBrokerHook,
  Event,
  ClientID,
} from '../core/types';

/**
 * HooksRegistry - Central registry for all EventBroker hook types
 *
 * This class encapsulates ALL hook management logic for EventBroker.
 * It provides a type-safe, domain-specific API over generic HookCollection.
 *
 * Architecture:
 * - Uses composition (4 HookCollection instances)
 * - Each HookCollection handles one hook type
 * - EventBroker only calls methods on this registry
 * - All hook execution details are hidden
 *
 * Hook types:
 * - onSubscribe: Called when a client subscribes to an event
 * - beforeSend: Called before sending (can block with false return)
 * - afterSend: Called after sending (for logging/metrics)
 * - brokerHooks: Plugin-style hooks with full broker access
 *
 * @template T - Event type union
 * @template P - Payload map
 * @template M - Client ID type
 */
export class HooksRegistry<T extends string, P extends Record<T, any>, M extends ClientID> {
  #onSubscribeHooks = new HookCollection<OnSubscribeHandlerHook<T, M>>();
  #beforeSendHooks = new HookCollection<BeforeSendHook<T, P>>();
  #afterSendHooks = new HookCollection<AfterSendHook<T, P>>();
  #brokerHookCleanups = new HookCollection<() => void>();

  /**
   * Register onSubscribe hook(s)
   *
   * Called whenever a client subscribes to an event type.
   *
   * @param hook - Single hook or array of hooks
   * @returns Cleanup function to remove the hook(s)
   */
  addOnSubscribeHandler(
    hook: OnSubscribeHandlerHook<T, M> | OnSubscribeHandlerHook<T, M>[],
  ): () => void {
    return this.#onSubscribeHooks.add(hook);
  }

  /**
   * Register beforeSend hook(s)
   *
   * Called before each event is sent. Return false to block the event.
   *
   * @param hook - Single hook or array of hooks
   * @returns Cleanup function to remove the hook(s)
   */
  addBeforeSendEvent(hook: BeforeSendHook<T, P> | BeforeSendHook<T, P>[]): () => void {
    return this.#beforeSendHooks.add(hook);
  }

  /**
   * Register afterSend hook(s)
   *
   * Called after each event is sent. Receives delivery result.
   *
   * @param hook - Single hook or array of hooks
   * @returns Cleanup function to remove the hook(s)
   */
  addAfterSendEvent(hook: AfterSendHook<T, P> | AfterSendHook<T, P>[]): () => void {
    return this.#afterSendHooks.add(hook);
  }

  /**
   * Register EventBroker plugin hook(s)
   *
   * Plugins receive full broker instance and can register multiple hooks.
   * Each plugin returns a cleanup function.
   *
   * @param hooks - Single plugin or array of plugins
   * @param broker - EventBroker instance
   * @returns Cleanup function to remove all plugin hooks
   */
  registerEventBrokerHooks(
    hooks: EventBrokerHook<T, P, M> | Array<EventBrokerHook<T, P, M>>,
    broker: any, // EventBroker instance
  ): () => void {
    const hooksList = Array.isArray(hooks) ? hooks : [hooks];
    const cleanupFunctions: Array<() => void> = [];

    for (const hook of hooksList) {
      try {
        const cleanup = hook(broker);
        if (typeof cleanup === 'function') {
          cleanupFunctions.push(cleanup);
        }
      } catch (e) {
        console.error('[EventBrokerHooks] hook init failed:', e);
      }
    }

    return this.#brokerHookCleanups.add(cleanupFunctions);
  }

  // ========================================
  // HOOK EXECUTION (called by EventBroker)
  // ========================================

  /**
   * Execute onSubscribe hooks
   *
   * @param eventType - Event type being subscribed to
   * @param microfrontendID - Client ID subscribing
   */
  onSubscribe(eventType: T, microfrontendID: M): void {
    this.#onSubscribeHooks.run((hook) => hook(eventType, microfrontendID));
  }

  /**
   * Execute beforeSend hooks
   *
   * @param event - Event about to be sent
   * @returns false if any hook blocks the event, true otherwise
   */
  beforeSend(event: Readonly<Event<T, P[T]>>): boolean {
    return this.#beforeSendHooks.run((hook) => hook(event));
  }

  /**
   * Execute afterSend hooks
   *
   * @param event - Event that was sent
   * @param result - Delivery result (success/handled status)
   */
  afterSend(event: Readonly<Event<T, P[T]>>, result: { success: boolean; handled: boolean }): void {
    this.#afterSendHooks.run((hook) => hook(event, result));
  }

  /**
   * Clear all hooks and execute cleanup functions
   */
  clear(): void {
    this.#onSubscribeHooks.clear();
    this.#beforeSendHooks.clear();
    this.#afterSendHooks.clear();
    this.#brokerHookCleanups.clear();
  }
}
