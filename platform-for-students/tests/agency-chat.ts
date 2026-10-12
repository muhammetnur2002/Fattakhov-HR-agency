/**
 * Переписка студента с агентством: беседу начинает агентство, студент отвечает
 * только после него, прочитанность считается по сторонам, тексты лежат
 * зашифрованными, удаление студента уносит переписку.
 *
 *   npm run test:agency
 *
 * На хранилище в памяти, без сервера и базы: правила одни и те же у памяти и
 * у Prisma, а сквозную проверку по HTTP делают smoke и ручной прогон.
 */
import assert from 'node:assert/strict';

import {
  AgencyChatError,
  cleanBody,
  cleanStaffName,
  countAgencyUnreadForStudent,
  getStaffThread,
  getStudentThread,
  postStaffMessage,
  postStudentMessage,
} from '../lib/agency-chat';
import { countUnread } from '../lib/chat';
import { getStore } from '../lib/db';
import { MESSAGE_MAX_LENGTH } from '../lib/types';

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

async function main() {
  const store = await getStore();
  const students = await store.students.list();
  assert.ok(students.length >= 2, 'в демо-данных должно быть два студента');
  const [anna, boris] = students;

  console.log('Переписка студента с агентством');

  await test('до первого сообщения агентства беседы нет и студент писать не может', async () => {
    const thread = await getStudentThread(anna.id);
    assert.equal(thread.messages.length, 0);
    assert.equal(thread.canWrite, false);
    await assert.rejects(() => postStudentMessage(anna.id, 'Здравствуйте'), AgencyChatError);
  });

  await test('сотрудник пишет студенту: сообщение зашифровано в хранилище и читается через сервис', async () => {
    const message = await postStaffMessage(anna.id, '  Мария К.  ', '  Предлагаем вакансию  ');
    assert.ok(message);
    assert.equal(message.body, 'Предлагаем вакансию');
    assert.equal(message.staffName, 'Мария К.');
    assert.equal(message.author, 'AGENCY');

    const [row] = await store.agencyMessages.listByStudent(anna.id);
    assert.notEqual(row.bodyEnc, 'Предлагаем вакансию');
    assert.ok(!row.bodyEnc.includes('вакансию'), 'текст не должен лежать открытым');
  });

  await test('непрочитанное агентства видит студент: значок и счётчик, открытие страницы гасит', async () => {
    assert.equal(await countAgencyUnreadForStudent(anna.id), 1);
    assert.equal(await countUnread({ role: 'STUDENT', profileId: anna.id }), 1);

    const opened = await getStudentThread(anna.id, { markRead: true });
    assert.equal(opened.unread, 1);
    assert.equal(opened.canWrite, true);
    assert.equal(await countAgencyUnreadForStudent(anna.id), 0);
  });

  await test('студент отвечает; сотрудник видит непрочитанное, чтение гасит его', async () => {
    await postStudentMessage(anna.id, 'Здравствуйте! Расскажите подробнее');
    const first = await getStaffThread(anna.id);
    assert.ok(first);
    assert.equal(first.unread, 1);
    assert.equal(first.messages.length, 2);
    const second = await getStaffThread(anna.id);
    assert.equal(second?.unread, 0);
  });

  await test('беседы разных студентов не смешиваются', async () => {
    const other = await getStudentThread(boris.id);
    assert.equal(other.messages.length, 0);
    assert.equal(await countAgencyUnreadForStudent(boris.id), 0);
  });

  await test('сообщение несуществующему студенту не создаётся', async () => {
    assert.equal(await postStaffMessage('no-such-student', 'Мария', 'Привет'), null);
    assert.equal(await getStaffThread('no-such-student'), null);
  });

  await test('пустое и слишком длинное сообщение отклоняются, подпись нормализуется', async () => {
    assert.throws(() => cleanBody('   '), AgencyChatError);
    assert.throws(() => cleanBody('я'.repeat(MESSAGE_MAX_LENGTH + 1)), AgencyChatError);
    assert.equal(cleanBody('я'.repeat(MESSAGE_MAX_LENGTH)).length, MESSAGE_MAX_LENGTH);
    assert.equal(cleanStaffName('   '), 'Агентство');
    assert.equal(cleanStaffName(undefined), 'Агентство');
    assert.equal(cleanStaffName('Мария   К.'), 'Мария К.');
    assert.equal(cleanStaffName('я'.repeat(100)).length, 60);
  });

  await test('сообщение студента не помечается «прочитанным» самим студентом', async () => {
    // Своё сообщение прочитанным отметить нельзя: прочитанность — это сторона-адресат
    await postStudentMessage(anna.id, 'Ещё вопрос');
    const marked = await store.agencyMessages.markRead(anna.id, 'STUDENT');
    assert.equal(marked, 0);
    assert.equal(await store.agencyMessages.unreadFor(anna.id, 'AGENCY'), 1);
  });

  await test('удаление студента уносит переписку', async () => {
    assert.ok((await store.agencyMessages.listByStudent(anna.id)).length > 0);
    await store.students.deleteByAccountId(anna.accountId);
    assert.equal((await store.agencyMessages.listByStudent(anna.id)).length, 0);
  });

  console.log(`\nПройдено: ${passed}, упало: ${failures.length}`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
