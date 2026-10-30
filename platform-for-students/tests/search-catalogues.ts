import assert from 'node:assert/strict';
import { getStore } from '../lib/db';
import { buildJobCatalogue, listAllCandidates, listCandidatesForVacancy, canSearchCandidates } from '../lib/services';
import { matchesJob, type JobFilters } from '../lib/job-search';
async function main() {
  assert.ok(!process.env.DATABASE_URL, 'Tests must use memory only');
  const store = await getStore();
  const student = (await store.students.list())[0];
  const employer = (await store.employers.list()).find(canSearchCandidates)!;
  assert.ok(student && employer);
  const catalogue = await listAllCandidates(employer.id);
  assert.ok(catalogue.length);
  for (const person of catalogue) {
    assert.equal(person.email, ''); assert.equal(person.phone, null);
    assert.equal(person.photoUrl, null); assert.equal(person.resumeUrl, null);
    const original = await store.students.findById(person.id);
    assert.ok(original?.studyVerified && original.status !== 'PAUSED' && original.status !== 'PLACED');
  }
  await assert.rejects(listAllCandidates('missing-employer'));
  const other = (await store.employers.list()).find((e) => e.id !== employer.id)!;
  const vacancy = (await store.vacancies.listByEmployer(employer.id))[0];
  assert.equal(await listCandidatesForVacancy(other.id, vacancy.id), null);
  const before = await buildJobCatalogue(student.id);
  assert.ok(before.length > 0);
  await store.swipes.create({ studentId: student.id, vacancyId: before[0].id, direction: 'LEFT' });
  const jobs = await buildJobCatalogue(student.id);
  assert.ok(jobs.some((v) => v.id === before[0].id), 'Search also includes skipped vacancies');
  const v = jobs[0];
  const f: JobFilters = { query: '', city: '', format: '', employment: '', salary: '', period: 'MONTH', days: [] };
  assert.ok(matchesJob(v, { ...f, query: ' ' + v.title.toUpperCase() + ' ' }));
  assert.equal(matchesJob(v, { ...f, city: 'Несуществующий город' }), false);
  assert.equal(matchesJob(v, { ...f, salary: '999999999' }), false);
  const paid = { ...v, salaryFrom: 500, salaryTo: 800, salaryPeriod: 'HOUR' as const };
  assert.ok(matchesJob(paid, { ...f, salary: '700', period: 'HOUR' }));
  assert.equal(matchesJob(paid, { ...f, salary: '700', period: 'MONTH' }), false);
  assert.equal(matchesJob({ ...paid, salaryFrom: null, salaryTo: null }, { ...f, salary: '1', period: 'HOUR' }), false);
  console.log('Search catalogues: access, contact privacy, full vacancy search and filters passed.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
