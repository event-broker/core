/**
 * Benchmark тесты производительности EventBroker
 */

import { EventBroker } from '../src/core/EventBroker';
import { InMemoryClient } from '../src/clients/InMemoryClient/InMemoryClient';
import * as Benchmark from 'benchmark';

type TestEvents = {
  'test.event.v1': { id: number; data: string };
  'heavy.event.v1': { payload: Record<string, any> };
};

describe('EventBroker Performance Benchmarks', () => {
  let broker: EventBroker<keyof TestEvents, TestEvents, string>;
  let client1: any;
  let client2: any;

  beforeEach(() => {
    broker = new EventBroker();
    client1 = new InMemoryClient('sender', broker);
    client2 = new InMemoryClient('receiver', broker);
  });

  afterEach(() => {
    broker.destroy();
  });

  test('Event Creation Performance', (done) => {
    const suite = new Benchmark.Suite();

    suite
      .add('createEvent - simple payload', () => {
        client1.sendTo('receiver', 'test.event.v1', {
          id: 1,
          data: 'test',
        });
      })
      .add('createEvent - complex payload', () => {
        client1.dispatch('heavy.event.v1', 'receiver', {
          payload: {
            users: Array(100)
              .fill(0)
              .map((_, i) => ({ id: i, name: `User${i}` })),
            metadata: { timestamp: Date.now(), version: '1.0' },
          },
        });
      })
      .on('complete', function (this: any) {
        console.log('\n=== Event Creation Performance ===');
        this.forEach((benchmark: any) => {
          console.log(`${benchmark.name}: ${Math.round(benchmark.hz).toLocaleString()} ops/sec`);
        });
        done();
      })
      .run({ async: false });
  }, 60000);

  test('Event Delivery Performance', (done) => {
    let receivedCount = 0;
    const totalEvents = 10000;

    // Подписываемся на события
    client2.on('test.event.v1', () => {
      receivedCount++;
    });

    const startTime = performance.now();

    // Отправляем события пакетом
    for (let i = 0; i < totalEvents; i++) {
      client1.sendTo('receiver', 'test.event.v1', {
        id: i,
        data: `test-${i}`,
      });
    }

    // Измеряем время доставки всех событий
    setTimeout(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = Math.round(receivedCount / (duration / 1000));

      console.log('\n=== Event Delivery Performance ===');
      console.log(`События отправлено: ${totalEvents}`);
      console.log(`События получено: ${receivedCount}`);
      console.log(`Время выполнения: ${duration.toFixed(2)}ms`);
      console.log(`Пропускная способность: ${throughput.toLocaleString()} events/sec`);

      expect(receivedCount).toBe(totalEvents);
      expect(throughput).toBeGreaterThan(50000); // минимум 50k events/sec

      done();
    }, 100);
  }, 60000);

  test('Memory Usage under Load', () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // Создаем много подписчиков
    const clients: any[] = [];
    for (let i = 0; i < 1000; i++) {
      const client = new InMemoryClient(`client-${i}`, broker);
      clients.push(client);
    }

    // Клиенты регистрируются автоматически в конструкторе

    // Подписываем всех на события
    clients.forEach((client) => {
      client.on('test.event.v1', () => {});
    });

    // Отправляем события
    for (let i = 0; i < 1000; i++) {
      client1.broadcast('test.event.v1', { id: i, data: 'test' });
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    console.log('\n=== Memory Usage ===');
    console.log(`Начальная память: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Конечная память: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Прирост памяти: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    // Разумные ограничения на память
    expect(memoryIncrease / 1024 / 1024).toBeLessThan(10); // < 10MB для 1k клиентов
  });

  test('Concurrent Publishers Performance', (done) => {
    const publishers = 50;
    const eventsPerPublisher = 100;
    let totalReceived = 0;
    const expectedTotal = publishers * eventsPerPublisher;

    // Один получатель для всех событий
    client2.on('test.event.v1', () => {
      totalReceived++;
    });

    const startTime = performance.now();

    // Создаем множественных отправителей
    const senders = Array(publishers)
      .fill(0)
      .map((_, i) => new InMemoryClient(`sender-${i}`, broker));

    // Клиенты регистрируются автоматически в конструкторе

    // Каждый отправитель шлет события параллельно
    Promise.all(
      senders.map(async (sender, senderIndex) => {
        for (let i = 0; i < eventsPerPublisher; i++) {
          sender.sendTo('receiver', 'test.event.v1', {
            id: senderIndex * eventsPerPublisher + i,
            data: `sender-${senderIndex}-event-${i}`,
          });
        }
      }),
    ).then(() => {
      setTimeout(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const throughput = Math.round(totalReceived / (duration / 1000));

        console.log('\n=== Concurrent Publishers Performance ===');
        console.log(`Отправители: ${publishers}`);
        console.log(`События на отправителя: ${eventsPerPublisher}`);
        console.log(`Всего событий: ${expectedTotal}`);
        console.log(`Получено событий: ${totalReceived}`);
        console.log(`Время: ${duration.toFixed(2)}ms`);
        console.log(`Throughput: ${throughput.toLocaleString()} events/sec`);

        expect(totalReceived).toBe(expectedTotal);
        expect(throughput).toBeGreaterThan(20000); // минимум 20k events/sec

        done();
      }, 200);
    });
  }, 60000);
});
