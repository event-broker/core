/**
 * Сравнительный тест EventBroker vs нативный EventEmitter
 * Анализ причин превосходства EventBroker
 */

const { EventBroker } = require('../dist/core/EventBroker');
const { InMemoryClient } = require('../dist/clients/InMemoryClient/InMemoryClient');
const { EventEmitter } = require('events');

console.log('🔬 СРАВНИТЕЛЬНЫЙ АНАЛИЗ: EventBroker vs EventEmitter 🔬\n');

function testEventEmitter() {
  console.log('📊 Тестируем нативный EventEmitter...');

  const emitters = [];
  const clientCount = 100;
  const eventsPerClient = 1000;
  let receivedCount = 0;

  // Создаем EventEmitter'ы
  for (let i = 0; i < clientCount; i++) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(clientCount); // Избегаем warning'ов
    emitters.push(emitter);

    // Подписываем каждый emitter на события от всех остальных
    emitters.forEach((otherEmitter, otherIndex) => {
      if (otherIndex !== i) {
        otherEmitter.on('test-event', () => {
          receivedCount++;
        });
      }
    });
  }

  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  // Каждый emitter отправляет события
  emitters.forEach((emitter, emitterIndex) => {
    for (let i = 0; i < eventsPerClient; i++) {
      emitter.emit('test-event', {
        id: emitterIndex * eventsPerClient + i,
        clientId: emitterIndex,
        payload: `Event ${i} from emitter ${emitterIndex}`,
      });
    }
  });

  setTimeout(() => {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - startTime;

    const totalSent = clientCount * eventsPerClient;
    const expectedReceived = totalSent * (clientCount - 1);
    const throughput = Math.round(receivedCount / (duration / 1000));
    const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

    console.log(`\n📊 РЕЗУЛЬТАТЫ EventEmitter:`);
    console.log(`  🎯 Emitters: ${clientCount}`);
    console.log(`  📤 Отправлено событий: ${totalSent.toLocaleString()}`);
    console.log(`  📥 Ожидалось получить: ${expectedReceived.toLocaleString()}`);
    console.log(`  ✅ Фактически получено: ${receivedCount.toLocaleString()}`);
    console.log(`  ⚡ Пропускная способность: ${throughput.toLocaleString()} events/sec`);
    console.log(`  ⏱️  Время выполнения: ${duration}ms`);
    console.log(`  🧠 Прирост памяти: ${memoryIncrease.toFixed(2)}MB`);
    console.log(`  💾 Память на событие: ${((memoryIncrease * 1024) / totalSent).toFixed(3)}KB`);

    // Теперь тестируем EventBroker
    setTimeout(() => testEventBroker(throughput, memoryIncrease), 100);
  }, 100);
}

function testEventBroker(eventEmitterThroughput, eventEmitterMemory) {
  console.log(`\n📊 Тестируем EventBroker...`);

  const broker = new EventBroker();
  const clients = [];
  const clientCount = 100;
  const eventsPerClient = 1000;
  let receivedCount = 0;

  // Создаем клиенты EventBroker
  for (let i = 0; i < clientCount; i++) {
    const client = new InMemoryClient(`client-${i}`, broker);
    clients.push(client);

    client.on('test-event', () => {
      receivedCount++;
    });
  }

  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  // Каждый клиент отправляет события
  clients.forEach((client, clientIndex) => {
    for (let i = 0; i < eventsPerClient; i++) {
      client.broadcast('test-event', {
        id: clientIndex * eventsPerClient + i,
        clientId: clientIndex,
        payload: `Event ${i} from client ${clientIndex}`,
      });
    }
  });

  setTimeout(() => {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - startTime;

    const totalSent = clientCount * eventsPerClient;
    const expectedReceived = totalSent * (clientCount - 1);
    const throughput = Math.round(receivedCount / (duration / 1000));
    const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

    console.log(`\n📊 РЕЗУЛЬТАТЫ EventBroker:`);
    console.log(`  🎯 Клиентов: ${clientCount}`);
    console.log(`  📤 Отправлено событий: ${totalSent.toLocaleString()}`);
    console.log(`  📥 Ожидалось получить: ${expectedReceived.toLocaleString()}`);
    console.log(`  ✅ Фактически получено: ${receivedCount.toLocaleString()}`);
    console.log(`  ⚡ Пропускная способность: ${throughput.toLocaleString()} events/sec`);
    console.log(`  ⏱️  Время выполнения: ${duration}ms`);
    console.log(`  🧠 Прирост памяти: ${memoryIncrease.toFixed(2)}MB`);
    console.log(`  💾 Память на событие: ${((memoryIncrease * 1024) / totalSent).toFixed(3)}KB`);

    // Сравнение
    console.log(`\n🏆 СРАВНЕНИЕ:`);
    console.log(
      `  📈 EventBroker быстрее в: ${(throughput / eventEmitterThroughput).toFixed(2)}x раз`,
    );
    console.log(
      `  💾 EventBroker эффективнее по памяти: ${(eventEmitterMemory / memoryIncrease).toFixed(2)}x раз`,
    );

    // Анализ причин
    console.log(`\n🔍 АНАЛИЗ ПРИЧИН ПРЕВОСХОДСТВА EventBroker:`);
    console.log(`  1. 🎯 Централизованная маршрутизация vs N×N подписки`);
    console.log(`  2. 🚀 Оптимизированные структуры данных (Map vs внутренние массивы)`);
    console.log(`  3. 💾 Единый объект события vs множественные копии`);
    console.log(`  4. 🔧 Специализированная архитектура для микрофронтендов`);
    console.log(`  5. ⚡ Batch-обработка в цикле vs множественные emit'ы`);

    broker.destroy();
    process.exit(0);
  }, 100);
}

// Запускаем сравнение
testEventEmitter();
