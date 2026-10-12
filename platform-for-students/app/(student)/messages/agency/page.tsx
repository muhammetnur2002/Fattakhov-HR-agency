import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AgencyChat } from '@/components/chat/AgencyChat';
import { getStudentThread } from '@/lib/agency-chat';
import { requireStudentPage } from '@/lib/security/guards';

export const metadata: Metadata = { title: 'Переписка с агентством' };
export const dynamic = 'force-dynamic';

/**
 * Переписка с агентством. Беседу открывает агентство; пока оно не написало,
 * здесь нечего показывать, и страница ведёт обратно в «Сообщения».
 */
export default async function AgencyMessagesPage() {
  const { student } = await requireStudentPage('/messages/agency');
  // Открытие страницы прочитывает сообщения агентства — значок в навигации гаснет
  const thread = await getStudentThread(student.id, { markRead: true });
  if (thread.messages.length === 0) redirect('/messages');
  return <AgencyChat initial={thread} />;
}
