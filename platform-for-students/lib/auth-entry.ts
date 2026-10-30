export type EntryRole = 'STUDENT' | 'EMPLOYER';

export function requestedEntryRole(pathname: string, role: string | null): EntryRole | null {
  if (pathname === '/register/company' || pathname.startsWith('/register/company/') || pathname === '/employer' || pathname.startsWith('/employer/')) return 'EMPLOYER';
  if (pathname === '/register' || pathname.startsWith('/register/') || ['/feed', '/jobs', '/applications', '/skipped', '/profile'].some(path => pathname === path || pathname.startsWith(`${path}/`))) return 'STUDENT';
  if (pathname === '/login') return role === 'employer' ? 'EMPLOYER' : role === 'student' ? 'STUDENT' : null;
  return null;
}

export function roleLoginUrl(role: EntryRole): string {
  return `/login?role=${role.toLowerCase()}`;
}
