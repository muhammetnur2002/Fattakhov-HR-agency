import assert from 'node:assert/strict';
import { matchesCandidate } from '../lib/candidate-search';
import { createMemoryStore } from '../lib/db/memory';

async function main() {
  const student = { fullName: 'Анна Иванова', city: 'Казань', university: 'КФУ', speciality: 'Дизайн', skills: ['Figma'], workDays: ['MON' as const], gender: 'FEMALE' as const };
  const filters = { query: '', city: '', university: '', days: [], genders: [] };
  assert.equal(matchesCandidate(student, { ...filters, query: '  КАЗАНЬ figma ' }), true);
  assert.equal(matchesCandidate(student, { ...filters, query: 'Python' }), false);
  assert.equal(matchesCandidate(student, { ...filters, city: 'Москва' }), false);
  assert.equal(matchesCandidate(student, { ...filters, university: 'КФУ', days: ['MON'], genders: ['FEMALE'] }), true);
  assert.equal(matchesCandidate(student, { ...filters, days: ['TUE'] }), false);
  assert.equal(matchesCandidate(student, { ...filters, university: 'Другой вуз' }), false);
  assert.equal(matchesCandidate({ ...student, city: null }, filters), true);

  // The UI reuses DELETE /api/swipes: remove the student's swipe and application.
  const store = await createMemoryStore();
  const [first, second] = await store.students.list();
  const existing = (await store.applications.listAll())[0];
  assert.ok(first && second && existing);
  const vacancyId = existing.vacancyId;
  for (const person of [first, second]) {
    await store.swipes.create({ studentId: person.id, vacancyId, direction: 'RIGHT' });
    await store.applications.upsert({ studentId: person.id, vacancyId });
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    await store.swipes.remove(first.id, vacancyId);
    await store.applications.removeByPair(first.id, vacancyId);
  }
  assert.equal((await store.applications.listByStudent(first.id)).some((a) => a.vacancyId === vacancyId), false);
  assert.equal((await store.swipes.swipedVacancyIds(first.id)).includes(vacancyId), false);
  assert.equal((await store.applications.listByStudent(second.id)).some((a) => a.vacancyId === vacancyId), true);
  assert.equal((await store.swipes.swipedVacancyIds(second.id)).includes(vacancyId), true);
  await store.applications.upsert({ studentId: first.id, vacancyId });
  assert.equal((await store.applications.listByStudent(first.id)).some((a) => a.vacancyId === vacancyId), true);
  console.log('Candidate search and application withdrawal checks passed (memory only).');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
