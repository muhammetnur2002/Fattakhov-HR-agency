import 'server-only';
import { createHash } from 'node:crypto';
import { scanImage, scanMalware, type Verdict } from './content-checks';

type Checks = { malware(file: File): Promise<Verdict>; image(file: File): Promise<Verdict> };
/** Prepared scan coordinator, NOT an upload/delivery API. A clear result authorizes
 * no download: private quarantine, membership and publication remain separate gates.
 * Documents are held until embedded-image inspection is implemented.
 */
export async function checkChatAttachment(file: File, checks: Checks = { malware: scanMalware, image: scanImage }) {
  if (!file.size || file.size > 4 * 1024 * 1024) return { verdict: 'blocked' as const, reason: 'size', hash: null };
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  const ext = file.name.split('.').pop()?.toLowerCase();
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!((jpeg && ['jpg', 'jpeg'].includes(ext ?? '') && file.type === 'image/jpeg') ||
    (png && ext === 'png' && file.type === 'image/png') || (webp && ext === 'webp' && file.type === 'image/webp'))) {
    return { verdict: 'blocked' as const, reason: 'unsupported-format', hash };
  }
  // Snapshot the same bytes for every provider; never trust a caller's claimed hash.
  const snapshot = new File([bytes], `scan.${ext}`, { type: file.type });
  try {
    const malware = await checks.malware(snapshot);
    if (malware !== 'clear') return { verdict: malware, reason: 'malware', hash };
    const image = await checks.image(snapshot);
    return { verdict: image, reason: image === 'clear' ? 'checked' : 'image', hash };
  } catch { return { verdict: 'unavailable' as const, reason: 'scanner-unavailable', hash }; }
}
