/**
 * Хранилище пуш-подписок: переезд устройства к другому человеку, потолок
 * устройств, отписка только своего устройства, счётчик отказов.
 *
 *   npx tsx tests/push-store.ts
 *
 * На хранилище в памяти, без сервера и базы: правила одни и те же у
 * памяти и у Prisma, а сквозная проверка (npm run smoke) ходит через API.
 */
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/db/memory';

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: `p${n}`, auth: `a${n}`, userAgent: 'test' });

async function main() {
  const store = await createMemoryStore();
  const alice = 'account-alice';
  const bob = 'account-bob';

  console.log('Пуш-подписки в хранилище');

  await test('подписка сохраняется и видна владельцу, чужому — нет', async () => {
    await store.pushSubscriptions.save(alice, sub(1), 10);
    assert.equal((await store.pushSubscriptions.listByAccount(alice)).length, 1);
    assert.equal((await store.pushSubscriptions.listByAccount(bob)).length, 0);
  });

  await test('то же устройство у другого человека: подписка переезжает, а не двоится', async () => {
    await store.pushSubscriptions.save(bob, sub(1), 10);
    assert.equal((await store.pushSubscriptions.listByAccount(alice)).length, 0);
    assert.equal((await store.pushSubscriptions.listByAccount(bob)).length, 1);
  });

  await test('повторная подписка не плодит строки и обнуляет счётчик отказов', async () => {
    const [row] = await store.pushSubscriptions.listByAccount(bob);
    await store.pushSubscriptions.recordFailure(row.id);
    await store.pushSubscriptions.recordFailure(row.id);
    const failed = await store.pushSubscriptions.recordFailure(row.id);
    assert.equal(failed?.failureCount, 3);
    await store.pushSubscriptions.save(bob, sub(1), 10);
    const after = await store.pushSubscriptions.listByAccount(bob);
    assert.equal(after.length, 1);
    assert.equal(after[0].failureCount, 0);
  });

  await test('удачная отправка отмечается и обнуляет отказы', async () => {
    const [row] = await store.pushSubscriptions.listByAccount(bob);
    await store.pushSubscriptions.recordFailure(row.id);
    await store.pushSubscriptions.recordSuccess(row.id);
    const [after] = await store.pushSubscriptions.listByAccount(bob);
    assert.equal(after.failureCount, 0);
    assert.ok(after.lastSuccessAt instanceof Date);
  });

  await test('сверх потолка вытесняются самые старые, новая остаётся', async () => {
    const carol = 'account-carol';
    for (let i = 100; i < 105; i++) {
      await store.pushSubscriptions.save(carol, sub(i), 3);
      await new Promise((r) => setTimeout(r, 3)); // разные createdAt
    }
    const rows = await store.pushSubscriptions.listByAccount(carol);
    assert.equal(rows.length, 3);
    const endpoints = rows.map((r) => r.endpoint);
    assert.ok(endpoints.includes(sub(104).endpoint), 'последняя подписка на месте');
    assert.ok(!endpoints.includes(sub(100).endpoint), 'самая старая вытеснена');
  });

  await test('отписать можно только своё устройство', async () => {
    assert.equal(await store.pushSubscriptions.deleteByEndpoint(alice, sub(1).endpoint), 0); // не её
    assert.equal((await store.pushSubscriptions.listByAccount(bob)).length, 1);
    assert.equal(await store.pushSubscriptions.deleteByEndpoint(bob, sub(1).endpoint), 1);
    assert.equal((await store.pushSubscriptions.listByAccount(bob)).length, 0);
  });

  await test('«отключить на остальных» оставляет только указанное устройство', async () => {
    const dave = 'account-dave';
    for (const n of [200, 201, 202]) await store.pushSubscriptions.save(dave, sub(n), 10);
    assert.equal(await store.pushSubscriptions.deleteOthers(dave, sub(201).endpoint), 2);
    const rows = await store.pushSubscriptions.listByAccount(dave);
    assert.deepEqual(rows.map((r) => r.endpoint), [sub(201).endpoint]);
  });

  await test('удалённая подписка не ломает отметку отказа', async () => {
    const eve = 'account-eve';
    const saved = await store.pushSubscriptions.save(eve, sub(300), 10);
    await store.pushSubscriptions.deleteById(saved.id);
    assert.equal(await store.pushSubscriptions.recordFailure(saved.id), null);
  });

  console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
  if (failures.length) process.exitCode = 1;
}

void main();
