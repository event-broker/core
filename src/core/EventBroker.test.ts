/**
 * Тест CloudEvents v1.0 интеграции в EventBroker
 */

import { EventBroker } from './EventBroker';
import { InMemoryClient } from '../clients/InMemoryClient/InMemoryClient';

// Тестовые типы событий
type TestEventType = 'user.created.v1' | 'order.placed.v1';
type TestEventPayloads = {
  'user.created.v1': { userId: string; email: string };
  'order.placed.v1': { orderId: string; amount: number };
};

describe('EventBroker CloudEvents v1.0', () => {
  let broker: EventBroker<TestEventType, TestEventPayloads, string>;

  beforeEach(() => {
    broker = new EventBroker<TestEventType, TestEventPayloads, string>();
  });

  afterEach(() => {
    broker.destroy();
  });

  test('должен создавать события в CloudEvents v1.0 формате', () => {
    const client = new InMemoryClient('user-service', broker);
    const receiverClient = new InMemoryClient('notification-service', broker);

    // Клиенты регистрируются автоматически в конструкторе

    let receivedEvent: any;

    receiverClient.on('user.created.v1', (event) => {
      receivedEvent = event;
    });

    // Отправляем событие (tab sync автоматический)
    client.sendTo('notification-service', 'user.created.v1', {
      userId: '123',
      email: 'test@example.com',
    });

    const event = receivedEvent;

    // Проверяем обязательные поля CloudEvents
    expect(event.specversion).toBe('1.0');
    expect(event.type).toBe('user.created.v1');
    expect(event.source).toBe('user-service');
    expect(event.id).toBeDefined();
    expect(event.time).toBeDefined();
    expect(event.datacontenttype).toBe('application/json');

    // Проверяем данные
    expect(event.data).toEqual({ userId: '123', email: 'test@example.com' });

    // Проверяем MFE расширения
    expect(event['mfe-recipient']).toBe('notification-service');
    expect(event['mfe-sessionid']).toBeDefined();

    // CloudEvents структура соответствует типу
    expect(event.specversion).toBe('1.0');
  });

  test('должен обрабатывать события через подписчиков', (done) => {
    const receiverClient = new InMemoryClient('test-service', broker);
    const senderClient = new InMemoryClient('user-service', broker);

    // Клиенты регистрируются автоматически в конструкторе

    // Подписываемся на событие у получателя
    receiverClient.on('user.created.v1', (event) => {
      expect(event.type).toBe('user.created.v1');
      expect(event.source).toBe('user-service');
      expect((event.data as any).userId).toBe('123');
      expect(event['mfe-recipient']).toBe('test-service');
      done();
    });

    // Отправляем событие от отправителя
    senderClient.sendTo('test-service', 'user.created.v1', {
      userId: '123',
      email: 'test@example.com',
    });
  });

  test('должен поддерживать broadcast события', async () => {
    const handlerCalls: string[] = [];

    const client1 = new InMemoryClient('service-1', broker);
    const client2 = new InMemoryClient('service-2', broker);
    const client3 = new InMemoryClient('service-3', broker);

    // Клиенты регистрируются автоматически в конструкторе

    // Подписываемся на событие от разных сервисов
    client1.on('order.placed.v1', () => {
      handlerCalls.push('service-1');
    });
    client2.on('order.placed.v1', () => {
      handlerCalls.push('service-2');
    });
    client3.on('order.placed.v1', () => {
      handlerCalls.push('service-3');
    });

    // Отправляем broadcast из service-3
    await client3.broadcast('order.placed.v1', { orderId: '456', amount: 100 });

    // Проверяем что service-1 и service-2 получили событие, но service-3 (отправитель) - нет
    expect(handlerCalls).toContain('service-1');
    expect(handlerCalls).toContain('service-2');
    expect(handlerCalls).not.toContain('service-3');
  });

  test('должен генерировать уникальные ID для событий', async () => {
    const client1 = new InMemoryClient('service-1', broker);
    const client2 = new InMemoryClient('service-2', broker);

    // Клиенты регистрируются автоматически в конструкторе

    const receivedEvents: any[] = [];

    // Подписываемся на события
    client2.on('user.created.v1', (event) => {
      receivedEvents.push(event);
    });

    // Отправляем события с небольшим интервалом
    client1.sendTo('service-2', 'user.created.v1', {
      userId: '1',
      email: 'a@b.com',
    });

    // Небольшая задержка для разных timestamp
    await new Promise((resolve) => setTimeout(resolve, 2));

    client1.sendTo('service-2', 'user.created.v1', {
      userId: '2',
      email: 'c@d.com',
    });

    // Проверяем что получили 2 события с разными ID и временем
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].id).not.toBe(receivedEvents[1].id);
    expect(receivedEvents[0].time).not.toBe(receivedEvents[1].time);
  });

  // 📨 ACK Pattern Tests (перенесены из отдельного файла)
  describe('ACK Pattern (Transport acknowledgment)', () => {
    test('должен подтверждать успешную доставку события (ACK)', async () => {
      const senderClient = new InMemoryClient('users_app', broker);
      const receiverClient = new InMemoryClient('notification_app', broker);

      // Клиенты регистрируются автоматически в конструкторе

      // Получатель подписывается на событие
      receiverClient.on('user.created.v1', (event: any) => {
        console.log('Handler called - event DELIVERED:', event.data.userId);
      });

      // Отправитель получает подтверждение доставки
      const result = await senderClient.sendTo('notification_app', 'user.created.v1', {
        userId: '123',
        email: 'test@example.com',
      });

      // ✅ Доставка подтверждена
      expect(result.status).toBe('ACK');
      expect(result.message).toContain('delivered and handled');
    });

    test('должен возвращать NACK при отсутствии подписки', async () => {
      const senderClient = new InMemoryClient('users_app', broker);
      const receiverClient = new InMemoryClient('notification_app', broker);

      // Отправляем событие БЕЗ подписки
      const result = await senderClient.sendTo('notification_app', 'user.created.v1', {
        userId: '456',
        email: 'test2@example.com',
      });

      // ✅ Возвращает NACK - клиент не подписан на событие
      expect(result.status).toBe('NACK');
      expect(result.message).toContain('not subscribed');
    });

    test('должен возвращать NACK при ошибках в обработчике', async () => {
      const senderClient = new InMemoryClient('users_app', broker);
      const receiverClient = new InMemoryClient('notification_app', broker);

      // Клиенты регистрируются автоматически в конструкторе

      // Обработчик падает - событие считается необработанным
      receiverClient.on('user.created.v1', (event: any) => {
        console.log('Handler called - event DELIVERED');
        throw new Error('Business logic failed');
      });

      // Отправитель получает NACK так как обработка не удалась
      const result = await senderClient.sendTo('notification_app', 'user.created.v1', {
        userId: '789',
        email: 'will-fail@example.com',
      });

      // ❌ Обработка не удалась
      expect(result.status).toBe('NACK');
      expect(result.message).toContain('not handled');
    });

    test('dispatch всегда возвращает Promise с результатом доставки', async () => {
      const senderClient = new InMemoryClient('users_app', broker);
      const receiverClient = new InMemoryClient('notification_app', broker);

      // Клиенты регистрируются автоматически в конструкторе

      let eventReceived = false;

      receiverClient.on('user.created.v1', () => {
        eventReceived = true;
      });

      // Всегда возвращает Promise
      const result = await senderClient.sendTo('notification_app', 'user.created.v1', {
        userId: '999',
        email: 'normal@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(eventReceived).toBe(true);
    });

    test('должен поддерживать ACK для broadcast событий', async () => {
      const senderClient = new InMemoryClient('users_app', broker);
      const client1 = new InMemoryClient('service-1', broker);
      const client2 = new InMemoryClient('service-2', broker);

      // Клиенты регистрируются автоматически в конструкторе

      let handlersCalledCount = 0;

      // Подписываем двух получателей
      client1.on('user.created.v1', () => {
        handlersCalledCount++;
      });
      client2.on('user.created.v1', () => {
        handlersCalledCount++;
      });

      // Отправляем broadcast
      const result = await senderClient.broadcast('user.created.v1', {
        userId: '999',
        email: 'broadcast@example.com',
      });

      // ✅ Broadcast успешно отправлен подписчикам
      expect(result.status).toBe('ACK');
      expect(result.message).toContain('2');
      expect(handlersCalledCount).toBe(2);
    });
  });

  // 🎯 New Unicast/Broadcast API Tests
  describe('sendTo() and broadcast() methods', () => {
    test('sendTo() должен отправлять сообщение конкретному клиенту', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      let receivedEvent: any = null;
      receiverClient.on('user.created.v1', (event) => {
        receivedEvent = event;
      });

      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: 'user123',
        email: 'test@example.com',
      });

      // unified EventResult
      expect(result.status).toBe('ACK');
      expect(result.status).toBe('ACK');
      expect(result.clientId).toBe('receiver');
      expect(result.message).toContain('delivered and handled');
      expect(result.timestamp).toBeDefined();
      expect(receivedEvent.data.userId).toBe('user123');
    });

    test('sendTo() должен возвращать NACK для несуществующего клиента', async () => {
      const senderClient = new InMemoryClient('sender', broker);

      const result = await senderClient.sendTo('nonexistent', 'user.created.v1', {
        userId: 'user123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.status).toBe('NACK');
      expect(result.clientId).toBe('nonexistent');
      expect(result.message).toContain('not subscribed');
    });

    test('sendTo() должен возвращать NACK если обработчик упал с ошибкой', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      // Подписываем на событие с ошибкой в обработчике
      receiverClient.on('user.created.v1', () => {
        throw new Error('Handler error');
      });

      const result = await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: 'user123',
        email: 'test@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.status).toBe('NACK');
      expect(result.clientId).toBe('receiver');
      expect(result.message).toContain('not handled');
    });

    test('broadcast() должен отправлять сообщение всем клиентам кроме отправителя', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const client1 = new InMemoryClient('client1', broker);
      const client2 = new InMemoryClient('client2', broker);
      const client3 = new InMemoryClient('client3', broker);

      let handlersCalledCount = 0;
      const handledBy: string[] = [];

      // Подписываем всех получателей
      client1.on('order.placed.v1', (event) => {
        handlersCalledCount++;
        handledBy.push('client1');
      });
      client2.on('order.placed.v1', (event) => {
        handlersCalledCount++;
        handledBy.push('client2');
      });
      // client3 не подписан

      const result = await senderClient.broadcast('order.placed.v1', {
        orderId: 'order123',
        amount: 100,
      });

      expect(result.status).toBe('ACK');
      expect(result.message).toContain('2'); // Broadcast sent to 2 subscribers
      expect(result.timestamp).toBeDefined();
      expect(handlersCalledCount).toBe(2);
      expect(handledBy).toEqual(['client1', 'client2']);
    });

    test('broadcast() должен работать когда нет других клиентов', async () => {
      const senderClient = new InMemoryClient('lonely_sender', broker);

      const result = await senderClient.broadcast('user.created.v1', {
        userId: 'lonely123',
        email: 'lonely@example.com',
      });

      expect(result.status).toBe('NACK');
      expect(result.message).toContain('No subscribers');
    });

    test('broadcast() должен корректно обрабатывать ошибки в обработчиках', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const errorClient = new InMemoryClient('error_client', broker);

      // Подписываем клиента на событие с ошибкой
      errorClient.on('user.created.v1', async () => {
        throw new Error('Handler error');
      });

      const result = await senderClient.broadcast('user.created.v1', {
        userId: 'error123',
        email: 'error@example.com',
      });

      expect(result.status).toBe('ACK');
      expect(result.message).toContain('1');

      // Даём время на обработку ошибки в fire-and-forget режиме
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  // 🔄 Unsubscription Tests (EventEmitter-style API)
  describe('Client Subscription/Unsubscription', () => {
    test('должен отписывать обработчик через off()', async () => {
      const senderClient = new InMemoryClient('sender', broker);
      const receiverClient = new InMemoryClient('receiver', broker);

      let handlerCalled = false;

      const handler = () => {
        handlerCalled = true;
      };

      // Подписываемся на событие
      receiverClient.on('user.created.v1', handler);

      // Отправляем событие - обработчик должен сработать
      await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '123',
        email: 'test@test.com',
      });
      expect(handlerCalled).toBe(true);

      // Сбрасываем флаг
      handlerCalled = false;

      // Отписываемся от события
      receiverClient.off('user.created.v1', handler);

      // Отправляем событие снова - обработчик НЕ должен сработать
      await senderClient.sendTo('receiver', 'user.created.v1', {
        userId: '456',
        email: 'test2@test.com',
      });
      expect(handlerCalled).toBe(false);
    });

    test('должен очищать все обработчики через clear()', () => {
      const client = new InMemoryClient('test-service', broker);
      // Клиенты регистрируются автоматически в конструкторе

      let handlersCallCount = 0;

      // Подписываем обработчики на разные события через on()
      client.on('user.created.v1', () => {
        handlersCallCount++;
      });
      client.on('order.placed.v1', () => {
        handlersCallCount++;
      });
      client.on('user.created.v1', () => {
        handlersCallCount++;
      }); // второй обработчик на то же событие

      // Очищаем все обработчики
      client.destroy(); // clear() removed - use destroy() instead

      // Отправляем события - обработчики не должны сработать
      client.sendTo('test-service', 'user.created.v1', { userId: '123', email: 'test@test.com' });
      client.sendTo('test-service', 'order.placed.v1', { orderId: 'order-123', amount: 100.5 });

      expect(handlersCallCount).toBe(0);
    });

    test('должен корректно работать с on/off и callback отпиской', () => {
      const client = new InMemoryClient('test-service', broker);
      // Клиенты регистрируются автоматически в конструкторе

      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      // Подписка через on() (возвращает функцию отписки)
      const unsubscribeCallback = client.on('user.created.v1', handler);

      // Отправляем событие - обработчик должен сработать
      client.sendTo('test-service', 'user.created.v1', { userId: '123', email: 'test@test.com' });
      expect(callCount).toBe(1);

      // Отписываемся через callback
      unsubscribeCallback();

      // Отправляем событие - обработчик не должен сработать
      client.sendTo('test-service', 'user.created.v1', {
        userId: '456',
        email: 'test2@test.com',
      });
      expect(callCount).toBe(1); // остался 1

      // Подписываемся снова через subscribe() для тестирования совместимости
      client.on('user.created.v1', handler);

      // Отправляем событие - обработчик должен сработать
      client.sendTo('test-service', 'user.created.v1', {
        userId: '789',
        email: 'test3@test.com',
      });
      expect(callCount).toBe(2);

      // Отписываемся через off()
      client.off('user.created.v1', handler);

      // Отправляем событие - обработчик не должен сработать
      client.sendTo('test-service', 'user.created.v1', {
        userId: '999',
        email: 'test4@test.com',
      });
      expect(callCount).toBe(2); // остался 2
    });
  });
});
