import { Logo } from '@/components/brand/Logo';
import { EmailVerifyBanner } from '@/components/account/EmailVerifyBanner';
import { PresencePulse } from '@/components/account/PresencePulse';
import { PushPrompt } from '@/components/account/PushPrompt';
import { NavTabs, type NavItem } from './NavTabs';
import { UserMenu } from './UserMenu';
import { AnimatedHeader } from './AnimatedHeader';
import { EmployerNotifications } from './EmployerNotifications';
import { PageTransition } from '@/components/motion/PageTransition';
import { maskEmail } from '@/lib/account-codes';
import { agencySiteUrl } from '@/lib/agency';
import { getStore } from '@/lib/db';
import { decryptSafe } from '@/lib/security/crypto';
import { getSession, getSessionAccount } from '@/lib/security/guards';
import type { SessionUser } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Каркас внутренних экранов.
 *
 * Шапка приклеена ниже безопасной области экрана и закрывает контент.
 * Навигация стоит между знаком и профилем;
 * на узких экранах её можно прокрутить, не сжимая кнопки.
 *
 * Плашка «подтвердите почту» живёт здесь, а не на каждой странице: каркас
 * есть у всех экранов кабинета, и забыть её на новой странице нельзя.
 */
export async function AppShell({
  nav,
  user,
  children,
  wide = false,
  panel = false,
  bell,
  notice,
}: {
  nav?: NavItem[];
  user?: { name: string; photoUrl?: string | null; subtitle?: string; href?: string };
  children: React.ReactNode;
  wide?: boolean;
  panel?: boolean;
  /** Кнопка справа в шапке вместо «Выйти» (колокольчик студента) */
  bell?: React.ReactNode;
  /** Плашка над содержимым, которая не пропадает при переходах между разделами (обновлённое согласие) */
  notice?: React.ReactNode;
}) {
  const session = await getSession();
  const unverifiedEmail = await pendingEmail(session);
  const backToCrmUrl = await backToCrm(session);

  return (
    <div data-panel-shell={panel || undefined} className={cn("flex flex-col", panel ? "fixed inset-0 overflow-hidden pt-[env(safe-area-inset-top)]" : "min-h-dvh")}>
      <header data-site-header className="sticky z-50 shrink-0 border-b border-[var(--hairline)] bg-ink">
        {nav && user && (session?.role === 'STUDENT' || session?.role === 'EMPLOYER') ? (
          <AnimatedHeader nav={nav} user={user} wide={wide} backToCrmUrl={backToCrmUrl}
            bell={bell ?? (session.role === 'EMPLOYER' ? <EmployerNotifications applications={nav.find(item => item.href === '/employer')?.badge ?? 0} unread={nav.find(item => item.href === '/employer/messages')?.badge ?? 0} /> : undefined)} />
        ) : <div
          className={cn(
            'page-x mx-auto flex h-[var(--header-h)] items-center justify-between gap-2 sm:gap-4',
            wide ? 'max-w-[100rem]' : 'max-w-6xl',
          )}
        >
          <Logo className="min-h-11 min-w-9 shrink-0 justify-center" />

          {nav && <div className="min-w-0 overflow-x-auto no-scrollbar py-2"><NavTabs items={nav} className="w-max" /></div>}

          {user ? (
            <UserMenu name={user.name} photoUrl={user.photoUrl} subtitle={user.subtitle} href={user.href} backToCrmUrl={backToCrmUrl} bell={bell} />
          ) : (
            <span className="text-caption text-paper-faint">Fattakhov HR Agency</span>
          )}
        </div>}

      </header>

      <main className={cn('page-x mx-auto w-full flex-1', panel ? 'flex min-h-0 flex-col overflow-hidden' : 'pb-24 pt-8', wide ? 'max-w-[100rem]' : 'max-w-6xl')}>
        {unverifiedEmail && <EmailVerifyBanner email={unverifiedEmail} />}
        {notice}
        {session && (session.role === 'STUDENT' || session.role === 'EMPLOYER') && (
          <PushPrompt accountId={session.accountId} audience={session.role === 'EMPLOYER' ? 'company' : 'student'} />
        )}
        {/* Пульс «я на платформе» — в каркасе, а не на экране переписки:
            человек может сидеть в ленте, пока собеседник смотрит на его
            статус в диалоге. Ничего не рисует */}
        {session && (session.role === 'STUDENT' || session.role === 'EMPLOYER') && <PresencePulse />}
        {panel ? <div className="min-h-0 flex-1 overflow-hidden">{children}</div> : <PageTransition>{children}</PageTransition>}
      </main>
    </div>
  );
}

/** Почта студента или компании, которую ещё нужно подтвердить, — маской; null — нечего. */
async function pendingEmail(session: SessionUser | null): Promise<string | null> {
  if (!session || session.role === 'ADMIN') return null;
  const account = await getSessionAccount();
  if (!account || account.emailVerifiedAt) return null;
  return maskEmail(decryptSafe(account.emailEnc));
}

/**
 * Ссылка «Открыть CRM» — только тем, кто пришёл именно из CRM: сотруднику
 * агентства по билету (у него есть `permissions`, у учётки admin:create
 * этого поля нет вовсе) и представителю клиента CRM (у его компании
 * заполнен `crmClientId`). Самостоятельно зарегистрированному работодателю
 * или студенту возвращаться некуда.
 */
async function backToCrm(session: SessionUser | null): Promise<string | null> {
  if (!session) return null;
  const agencyUrl = agencySiteUrl();
  if (!agencyUrl) return null;

  if (session.role === 'ADMIN' && session.permissions !== undefined) return agencyUrl;

  if (session.role === 'EMPLOYER') {
    const employer = await (await getStore()).employers.findByAccountId(session.accountId);
    if (employer?.crmClientId) return agencyUrl;
  }

  return null;
}
