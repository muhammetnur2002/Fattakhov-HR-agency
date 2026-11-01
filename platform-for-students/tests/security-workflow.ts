import assert from 'node:assert/strict';
import { checkChatAttachment } from '../lib/security/attachment-check';
import { securityAccessFor, incidentNeedsEmail, retryDelay } from '../lib/security/incident-policy';
import { isSecuritySessionRevoked } from '../lib/security/session-resolve';
import { APPLICATION_GUIDANCE } from '../lib/application-guidance';

const owner = 'owner@example.com';
assert.equal(securityAccessFor('ADMIN', owner, owner, ''), 'owner');
assert.equal(securityAccessFor('ADMIN', 'recruiter@example.com', owner, ''), null);
assert.equal(securityAccessFor('EMPLOYER', owner, owner, ''), null);
assert.equal(securityAccessFor('STUDENT', owner, owner, ''), null);
assert.equal(securityAccessFor('ADMIN', owner, undefined, owner), null);
assert.equal(securityAccessFor('ADMIN', 'reviewer@example.com', owner, 'reviewer@example.com'), 'delegate');
assert.equal(incidentNeedsEmail('LINK_POLICY'), false);
assert.equal(incidentNeedsEmail('MALWARE'), true);
assert(retryDelay(10) > retryDelay(0));
assert(retryDelay(1000) <= 86_400_000);
const revoked = new Date('2026-11-01T09:00:00.500Z');
const second = Math.floor(revoked.getTime() / 1000);
assert(isSecuritySessionRevoked(second, revoked));
assert(isSecuritySessionRevoked(undefined, revoked));
assert(!isSecuritySessionRevoked(second + 1, revoked));
assert(!isSecuritySessionRevoked(second, null));
for (const text of Object.values(APPLICATION_GUIDANCE)) assert(text.length > 20);
assert.match(APPLICATION_GUIDANCE.VIEWED, /просмотрел/);
assert.match(APPLICATION_GUIDANCE.INVITED, /чат/);

// Harmless synthetic signatures, never sent to external providers.
const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'photo.png', { type: 'image/png' });
async function main() {
let calls: string[] = [];
const clear = {
  malware: async () => { calls.push('malware'); return 'clear' as const; },
  image: async () => { calls.push('image'); return 'clear' as const; },
};
assert.equal((await checkChatAttachment(png, clear)).verdict, 'clear');
assert.deepEqual(calls, ['malware', 'image']);
calls = [];
assert.equal((await checkChatAttachment(new File(['<script>'], 'photo.png', { type: 'image/png' }), clear)).reason, 'unsupported-format');
assert.equal((await checkChatAttachment(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }), clear)).reason, 'unsupported-format');
assert.equal(calls.length, 0);
assert.equal((await checkChatAttachment(png, { ...clear, malware: async () => 'unavailable' })).verdict, 'unavailable');
assert.equal(calls.length, 0, 'Never forward bytes to the second provider when the first check fails');
assert.equal((await checkChatAttachment(png, { ...clear, image: async () => 'blocked' })).reason, 'image');
assert.equal((await checkChatAttachment(png, { ...clear, malware: async () => { throw Error('offline'); } })).verdict, 'unavailable');
assert.equal((await checkChatAttachment(new File([], 'empty.png'), clear)).reason, 'size');
assert.equal((await checkChatAttachment(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png'), clear)).reason, 'size');
console.log('Security workflow: access policy, revocation, retry policy and scan coordination passed (mock providers only).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
