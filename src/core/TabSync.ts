import type { Event } from './types';

/**
 * Управление синхронизацией событий между вкладками браузера через BroadcastChannel
 */
export class TabSync<T extends string, P extends Record<T, any>> {
  #sessionId: string;
  #channel: BroadcastChannel | null = null;
  #onMessage: (event: Event<T, P[T]>) => void;

  constructor(sessionId: string, onMessage: (event: Event<T, P[T]>) => void) {
    this.#sessionId = sessionId;
    this.#onMessage = onMessage;
    this.#initChannel();
  }

  /**
   * Инициализация BroadcastChannel
   */
  #initChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.#channel = new BroadcastChannel('__event-broker-sync__');
        this.#channel.addEventListener('message', this.#handleMessage);
      } catch (error) {
        console.warn('[TabSync] Failed to initialize BroadcastChannel:', error);
      }
    }
  }

  /**
   * Обработка входящих сообщений из других вкладок
   */
  #handleMessage = (e: MessageEvent<{ event: Event<T, P[T]>; sessionId: string }>) => {
    // Игнорируем события от текущей вкладки
    if (e.data.sessionId === this.#sessionId) {
      return;
    }

    this.#onMessage(e.data.event);
  };

  /**
   * Отправка события в другие вкладки
   */
  sync(event: Event<T, P[T]>): void {
    if (!this.#channel) return;

    try {
      this.#channel.postMessage({
        event,
        sessionId: this.#sessionId,
      });
    } catch (error) {
      console.warn('[TabSync] Failed to sync event:', error);
    }
  }

  /**
   * Закрытие канала синхронизации
   */
  destroy(): void {
    if (this.#channel) {
      try {
        this.#channel.close();
        this.#channel = null;
      } catch (error) {
        console.warn('[TabSync] Failed to close channel:', error);
      }
    }
  }
}
