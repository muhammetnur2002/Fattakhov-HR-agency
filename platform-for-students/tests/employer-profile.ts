import assert from 'node:assert/strict';
import { companyRegistrationSchema } from '../lib/company';
import { employerDestination } from '../lib/employer-destination';
import { createMemoryStore, AccountExistsError } from '../lib/db/memory';

async function main() {
  const crm = 'https://crm.example.test';
  for (const linked of [null, 'existing-crm-client']) {
    assert.equal(employerDestination('/employer/company', linked, crm), null);
  }
  assert.equal(employerDestination('/employer/messages', 'client', crm), `${crm}/students/messages`);
  assert.equal(employerDestination('/employer/candidates', 'client', crm), `${crm}/students/candidates`);
  assert.equal(employerDestination('/employer/vacancies', 'client', crm), `${crm}/students`);

  const input = {
    companyName: 'Тестовая компания', contactName: 'Анна Иванова',
    email: 'employer-profile@example.test', password: 'Test-Company-927!',
    phone: '+79001234567', city: 'Казань', consent: true, terms: true, marketing: false,
  };
  const parsed = companyRegistrationSchema.parse(input);
  assert.equal(parsed.inn, null);
  assert.equal(companyRegistrationSchema.safeParse({ ...input, consent: false }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...input, terms: false }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...input, phone: '' }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...input, companyName: '' }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...input, inn: '123' }).success, false);

  const store = await createMemoryStore();
  const registration = { ...parsed, consentVersion: 'test', termsVersion: 'test', marketingConsent: false };
  const created = await store.employers.createWithAccount(registration);
  assert.equal(created.account.role, 'EMPLOYER');
  assert.equal(created.employer.moderationStatus, 'PENDING');
  assert.equal(created.employer.crmClientId, null);
  await assert.rejects(store.employers.createWithAccount(registration), AccountExistsError);

  const existing = await store.employers.ensureForCrmClient({
    crmClientId: 'profile-test-client', companyName: 'Существующая компания',
    contactName: 'Иван Иванов', contactEmail: 'existing-profile@example.test', active: true,
  });
  await store.employers.updateProfile(existing.id, {
    companyName: existing.companyName, contactName: existing.contactName,
    about: 'Существующее описание', website: 'https://example.test', city: 'Казань',
    logoUrl: null, socials: [], photos: [], videoUrl: null,
  });
  const again = await store.employers.ensureForCrmClient({
    crmClientId: 'profile-test-client', companyName: 'Не перезаписывать',
    contactName: 'Другой контакт', contactEmail: 'existing-profile@example.test', active: false,
  });
  assert.equal(again.id, existing.id);
  assert.equal(again.accountId, existing.accountId);
  assert.equal(again.companyName, existing.companyName);
  assert.equal(again.about, 'Существующее описание');
  assert.equal(again.crmActive, false);
  console.log('Employer profile: registration, consent, duplicate protection, routing and CRM identity checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
