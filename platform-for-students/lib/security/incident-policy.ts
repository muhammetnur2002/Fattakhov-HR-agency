import type { Role } from '@/lib/types';

export type SecurityAccess = 'owner' | 'delegate' | null;
export function securityAccessFor(role: Role, email: string, owner: string | undefined, delegates: string | undefined): SecurityAccess {
  if (role !== 'ADMIN') return null;
  const normalized = email.trim().toLowerCase();
  const ownerEmail = owner?.trim().toLowerCase();
  if (!ownerEmail || !normalized) return null;
  if (normalized === ownerEmail) return 'owner';
  return delegates?.split(',').some(value => value.trim().toLowerCase() === normalized) ? 'delegate' : null;
}

export type IncidentKind = 'MALWARE' | 'LINK_POLICY';
export function incidentNeedsEmail(kind: IncidentKind) { return kind === 'MALWARE'; }
export function retryDelay(attempt: number) { return Math.min(86_400_000, 60_000 * 2 ** Math.min(attempt, 10)); }
