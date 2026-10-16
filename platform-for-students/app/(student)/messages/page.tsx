import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { ChatEmpty, ChatScreen } from '@/components/chat/ChatScreen';
import { ButtonLink } from '@/components/ui/Button';
import { getStudentThread } from '@/lib/agency-chat';
import { getThread, listThreads } from '@/lib/chat';
import { requireStudentPage } from '@/lib/security/guards';

export const metadata: Metadata = { title: 'Сообщения' };
export const dynamic = 'force-dynamic';

export default async function MessagesPage(
  props: {
    searchParams: Promise<{ thread?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { student } = await requireStudentPage('/messages');
  const viewer = { role: 'STUDENT' as const, profileId: student.id };
  const threads = await listThreads(viewer);
  // Переписка с агентством живёт отдельно от диалогов по откликам; ссылка на неё — над ними
  const agency = await getStudentThread(student.id);
  const lastAgencyMessage = agency.messages[agency.messages.length - 1];
  const agencyLink = lastAgencyMessage ? <AgencyLink unread={agency.unread} last={lastAgencyMessage.body} /> : null;

  if (threads.length === 0 && agencyLink) {
    return <div className="mx-auto max-w-lg">{agencyLink}</div>;
  }

  if (threads.length === 0) {
    return (
      <ChatEmpty
        action={
          <ButtonLink href="/feed" size="lg" iconRight={<ArrowRight />}>
            В ленту вакансий
          </ButtonLink>
        }
      />
    );
  }

  // Диалог открывается только по явной ссылке. Автовыбор первого удобен
  // на широком экране, но на телефоне выбросил бы человека сразу внутрь
  // переписки, мимо списка.
  const requested = searchParams.thread;
  const valid = requested && threads.some((t) => t.applicationId === requested) ? requested : null;
  const thread = valid ? await getThread(valid, viewer) : null;

  // Заголовок и подсказка живут внутри ChatScreen (шапка списка диалогов) —
  // отдельный заголовок страницы поверх был бы вторым «Сообщения» подряд
  return (
    <div className="space-y-3">
      {agencyLink}
      <ChatScreen initialThreads={threads} initialThread={thread} viewerRole="STUDENT" />
    </div>
  );
}

/** Карточка-вход в переписку с агентством. */
function AgencyLink({ unread, last }: { unread: number; last: string }) {
  const preview = last.replace(/\s+/g, ' ').trim();
  return (
    <Link
      href="/messages/agency"
      className="surface flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-paper/[0.04]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--hairline)] bg-graphite-900/50">
        <Building2 className="size-5 text-paper/60" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-paper">Агентство</span>
        <span className="block truncate text-small text-paper-dim">
          {preview.length > 90 ? `${preview.slice(0, 89)}…` : preview}
        </span>
      </span>
      {unread > 0 && (
        <span className="rounded-full bg-paper px-2 py-0.5 text-caption font-semibold text-ink">{unread}</span>
      )}
    </Link>
  );
}
