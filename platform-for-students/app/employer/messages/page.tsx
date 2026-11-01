import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { countUnread, getThread, listThreads } from '@/lib/chat';
import { requireEmployerPage } from '@/lib/security/guards';
import { employerNav } from '@/lib/employer-nav';
import { buildEmployerBoard } from '@/lib/services';

export const metadata: Metadata = { title: 'Сообщения · кабинет работодателя' };
export const dynamic = 'force-dynamic';

export default async function EmployerMessagesPage(
  props: {
    searchParams: Promise<{ thread?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { employer } = await requireEmployerPage('/employer/messages');
  const viewer = { role: 'EMPLOYER' as const, profileId: employer.id };

  const [threads, board, unread] = await Promise.all([
    listThreads(viewer),
    buildEmployerBoard(employer.id),
    countUnread(viewer),
  ]);

  const nav = employerNav(board.applications.length, unread);

  const requested = searchParams.thread;
  const valid = requested ?? null;
  const thread = valid ? await getThread(valid, viewer) : null;

  return (
    <AppShell panel
      user={{ name: employer.companyName, subtitle: employer.contactName, href: '/employer/company' }}
      nav={nav}
    >
      <ChatScreen initialThreads={threads} initialThread={thread} viewerRole="EMPLOYER" />
    </AppShell>
  );
}
