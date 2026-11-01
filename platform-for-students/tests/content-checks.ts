import assert from 'node:assert/strict';
import { contentCheckConfiguration, normalizeChatUrl, scanImage, scanLink, scanMalware } from '../lib/security/content-checks';

async function main() {
  // Isolated contract tests: no real requests, files, credentials or mail.
  for (const key of ['CHAT_CLOUDMERSIVE_KEY', 'CHAT_SIGHTENGINE_USER', 'CHAT_SIGHTENGINE_SECRET', 'CHAT_WEBRISK_KEY']) delete process.env[key];
  const file = new File(['fixture'], 'example.pdf');
  const never: typeof fetch = async () => { throw new Error('Unexpected network call'); };
  assert.equal(await scanMalware(file, never), 'unavailable');
  assert.equal(await scanImage(file, never), 'unavailable');
  assert.equal(await scanLink('https://example.com', never), 'unavailable');
  assert.equal(contentCheckConfiguration().attachmentsEnabled, false);
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://127.0.0.1', 'https://2130706433',
    'https://[::1]', 'https://example.com@evil.com', 'https://арр.com', 'https://xn--80a6aa.com',
    'https://host.local', 'https://localhost', 'https://example.com:8443', 'https://example.com\\@evil.com']) {
    assert.equal(normalizeChatUrl(url), null, url);
  }
  assert.equal(normalizeChatUrl('https://example.com/jobs#top'), 'https://example.com/jobs');
  process.env.CHAT_CLOUDMERSIVE_KEY = 'test-only';
  process.env.CHAT_SIGHTENGINE_USER = 'test-only';
  process.env.CHAT_SIGHTENGINE_SECRET = 'test-only';
  process.env.CHAT_WEBRISK_KEY = 'test-only';
  const reply = (json: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(json), { status });
  assert.equal(await scanMalware(file, reply({ CleanResult: true, FoundViruses: [] })), 'clear');
  assert.equal(await scanMalware(file, reply({ CleanResult: true, FoundViruses: [], ContainsScript: true })), 'blocked');
  assert.equal(await scanMalware(file, reply({ CleanResult: false, FoundViruses: [] })), 'blocked');
  assert.equal(await scanMalware(file, reply({ CleanResult: 'true' })), 'unavailable');
  assert.equal(await scanMalware(file, reply({}, 429)), 'unavailable');
  assert.equal(await scanMalware(file, never), 'unavailable');
  const imageResult = (score: number) => ({ status: 'success', nudity: {
    sexual_activity: 0.01, sexual_display: score, erotica: 0.01, suggestive_classes: { visibly_undressed: 0.01 },
  } });
  assert.equal(await scanImage(file, reply(imageResult(0.01))), 'clear');
  assert.equal(await scanImage(file, reply(imageResult(0.9))), 'blocked');
  assert.equal(await scanImage(file, reply(imageResult(-1))), 'unavailable');
  assert.equal(await scanImage(file, reply({ status: 'success' })), 'unavailable');
  assert.equal(await scanLink('https://example.com', reply({})), 'clear');
  assert.equal(await scanLink('https://example.com', reply({ threat: { threatTypes: ['MALWARE'], expireTime: '2030-01-01' } })), 'blocked');
  assert.equal(await scanLink('https://example.com', reply({ error: 'bad key' })), 'unavailable');
  assert.equal(await scanLink('https://example.com', never), 'unavailable');
  assert.equal(contentCheckConfiguration().attachmentsEnabled, false);
  console.log('Content checks: missing config, provider errors, malformed responses, threat verdicts and URL policy passed. No network used.');
}
void main();
