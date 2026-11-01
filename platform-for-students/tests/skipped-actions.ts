import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/db/memory';
import type { DataStore } from '../lib/db/types';
import { getThread, postMessage, ThreadLockedError } from '../lib/chat';

async function main() {
  // Isolated memory only: never load a configured database or send notifications.
  const store = await createMemoryStore();
  (globalThis as unknown as { fhrStore: Promise<DataStore> }).fhrStore = Promise.resolve(store);
  const [student, other] = await store.students.list();
  const [vacancy] = await store.vacancies.listActive();
  assert.ok(student && other && vacancy);
  await store.applications.removeByPair(student.id, vacancy.id);
  await store.swipes.create({ studentId: student.id, vacancyId: vacancy.id, direction: 'LEFT' });
  assert.equal(await store.swipes.dismiss(other.id, vacancy.id), false);
  assert.equal(await store.swipes.dismiss(student.id, vacancy.id), true);
  assert.equal((await store.swipes.listByStudent(student.id, 'LEFT')).some(s => s.vacancyId === vacancy.id), false);
  assert.ok((await store.swipes.swipedVacancyIds(student.id)).includes(vacancy.id), 'dismissed vacancy must stay out of the feed');
  assert.equal(await store.swipes.dismiss(student.id, vacancy.id), true, 'repeat delete is idempotent');
  await store.swipes.create({ studentId: student.id, vacancyId: vacancy.id, direction: 'RIGHT' });
  const application = await store.applications.upsert({ studentId: student.id, vacancyId: vacancy.id });
  assert.equal(await store.swipes.dismiss(student.id, vacancy.id), false, 'cannot dismiss an active application');
  assert.equal((await store.applications.findById(application.id))?.id, application.id);
  const viewer = { role: 'STUDENT' as const, profileId: student.id };
  assert.equal((await getThread(application.id, viewer))?.canWrite, true);
  assert.ok(await postMessage(application.id, viewer, 'Тест первого сообщения после отклика'));
  assert.equal(await postMessage(application.id, { role: 'STUDENT', profileId: other.id }, 'Чужой диалог'), null);
  await store.applications.setStatus(application.id, 'REJECTED');
  assert.equal((await getThread(application.id, viewer))?.canWrite, false);
  await assert.rejects(postMessage(application.id, viewer, 'Архив'), ThreadLockedError);
  await store.swipes.create({ studentId: student.id, vacancyId: vacancy.id, direction: 'LEFT' });
  assert.ok((await store.swipes.listByStudent(student.id, 'LEFT')).some(s => s.vacancyId === vacancy.id), 'a new explicit skip clears dismissal');
  console.log('Skipped actions: persistent dismissal, isolation, active application protection, first-message permission and rejected-thread lock passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
