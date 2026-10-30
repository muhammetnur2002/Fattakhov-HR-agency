import { redirect } from 'next/navigation';
import { getSession, redirectIfRevoked } from '@/lib/security/guards';
import { HOME_BY_ROLE } from '@/lib/security/session';
import { roleLoginUrl } from '@/lib/auth-entry';
import { NOINDEX_METADATA } from '@/lib/seo';
import { SwitchAccount } from '@/components/account/SwitchAccount';

export const metadata = { title: 'Сменить аккаунт', ...NOINDEX_METADATA };

export default async function SwitchAccountPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  if (role !== 'student' && role !== 'employer') redirect('/login');
  const target = role === 'employer' ? 'EMPLOYER' : 'STUDENT';
  await redirectIfRevoked(roleLoginUrl(target));
  const session = await getSession();
  if (!session) redirect(roleLoginUrl(target));
  if (session.role === target) redirect(HOME_BY_ROLE[session.role]);
  return <SwitchAccount currentRole={session.role} targetRole={target} cancelHref={HOME_BY_ROLE[session.role]} />;
}
