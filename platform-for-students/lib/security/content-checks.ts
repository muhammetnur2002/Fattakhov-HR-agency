import 'server-only';
import { domainToUnicode } from 'node:url';
import { z } from 'zod';

/** Provider adapters only. No attachment delivery is enabled by adding credentials. */
export type Verdict = 'clear' | 'blocked' | 'unavailable';
type Fetcher = typeof fetch;
const timeout = () => AbortSignal.timeout(15_000);
const score = z.number().finite().min(0).max(1);
const malware = z.object({ CleanResult: z.boolean(), FoundViruses: z.array(z.unknown()) }).passthrough();
const nudity = z.object({ status: z.literal('success'), nudity: z.object({
  sexual_activity: score, sexual_display: score, erotica: score,
  suggestive_classes: z.object({ visibly_undressed: score }),
}) });

export function contentCheckConfiguration() {
  return {
    malware: Boolean(process.env.CHAT_CLOUDMERSIVE_KEY),
    images: Boolean(process.env.CHAT_SIGHTENGINE_USER && process.env.CHAT_SIGHTENGINE_SECRET),
    links: Boolean(process.env.CHAT_WEBRISK_KEY),
    // Intentional release gate: quarantine, incident workflow and integration tests
    // must be completed before a follow-up change enables uploads.
    attachmentsEnabled: false,
  };
}

export async function scanMalware(file: File, fetcher: Fetcher = fetch): Promise<Verdict> {
  const key = process.env.CHAT_CLOUDMERSIVE_KEY;
  if (!key || file.size > 4 * 1024 * 1024 || file.size === 0) return 'unavailable';
  try {
    const body = new FormData();
    body.set('inputFile', file);
    const headers: Record<string, string> = { Apikey: key, restrictFileTypes: '.pdf,.docx,.jpg,.jpeg,.png,.webp' };
    for (const option of ['Executables', 'InvalidFiles', 'Scripts', 'PasswordProtectedFiles', 'Macros',
      'XmlExternalEntities', 'InsecureDeserialization', 'Html', 'UnsafeArchives', 'OleEmbeddedObject', 'UnwantedAction']) {
      headers[`allow${option}`] = 'false';
    }
    const response = await fetcher('https://api.cloudmersive.com/virus/scan/file/advanced', {
      method: 'POST', headers, body, signal: timeout(), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const parsed = malware.safeParse(await response.json());
    if (!parsed.success) return 'unavailable';
    const result = parsed.data;
    return result.CleanResult && result.FoundViruses.length === 0 &&
      !Object.entries(result).some(([name, value]) => name.startsWith('Contains') && value === true)
      ? 'clear' : 'blocked';
  } catch { return 'unavailable'; }
}

export async function scanImage(file: File, fetcher: Fetcher = fetch): Promise<Verdict> {
  const user = process.env.CHAT_SIGHTENGINE_USER;
  const secret = process.env.CHAT_SIGHTENGINE_SECRET;
  if (!user || !secret || file.size > 4 * 1024 * 1024 || file.size === 0) return 'unavailable';
  try {
    const body = new FormData();
    body.set('media', file); body.set('models', 'nudity-2.1');
    body.set('api_user', user); body.set('api_secret', secret);
    const response = await fetcher('https://api.sightengine.com/1.0/check.json', {
      method: 'POST', body, signal: timeout(), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const result = nudity.safeParse(await response.json());
    if (!result.success) return 'unavailable';
    const n = result.data.nudity;
    // Provisional threshold: validate on agreed test examples before release.
    return Math.max(n.sexual_activity, n.sexual_display, n.erotica, n.suggestive_classes.visibly_undressed) >= 0.5
      ? 'blocked' : 'clear';
  } catch { return 'unavailable'; }
}

/** Conservative URL policy, not a claim that an unlisted domain is safe. */
export function normalizeChatUrl(raw: string): string | null {
  if (raw.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
      host.includes(':') || /^[\d.]+$/.test(host)) return null;
    // IDNs are held for review, including all-Cyrillic homographs; never silently transliterate.
    if (domainToUnicode(host) !== host || host.split('.').some(label => label.startsWith('xn--'))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export async function scanLink(raw: string, fetcher: Fetcher = fetch): Promise<Verdict> {
  const uri = normalizeChatUrl(raw);
  if (!uri) return 'blocked';
  const key = process.env.CHAT_WEBRISK_KEY;
  if (!key) return 'unavailable';
  try {
    const query = new URLSearchParams({ uri });
    for (const threat of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) query.append('threatTypes', threat);
    // Never fetch a user-supplied destination on the application server (SSRF).
    const response = await fetcher(`https://webrisk.googleapis.com/v1/uris:search?${query}`, {
      headers: { 'X-Goog-Api-Key': key }, signal: timeout(), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const result = z.object({ threat: z.object({ threatTypes: z.array(z.string()).min(1) }).optional() }).strict()
      .safeParse(await response.json());
    if (!result.success) return 'unavailable';
    return result.data.threat ? 'blocked' : 'clear';
  } catch { return 'unavailable'; }
}
