'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { Conversation } from './Conversation';
import { apiErrorMessage } from '@/lib/api-client';
import type { AgencyMessageDTO, AgencyThreadDTO } from '@/lib/agency-chat';
import type { PendingMessageDTO, ThreadDTO } from '@/lib/types';

/**
 * Переписка студента с агентством.
 *
 * Показывается тем же компонентом, что и диалоги с работодателями: лента, поле
 * ввода, повтор неотправленного. Агентство глазами студента — собеседник в
 * роли «работодателя», поэтому автор AGENCY отображается как чужая реплика.
 */

const AGENCY_NAME = 'Агентство';

function toThread(source: AgencyThreadDTO): ThreadDTO {
  const last = source.messages[source.messages.length - 1] ?? null;
  return {
    applicationId: 'agency',
    vacancyId: 'agency',
    vacancyTitle: 'Переписка с агентством',
    company: AGENCY_NAME,
    counterpartName: AGENCY_NAME,
    counterpartPhotoUrl: null,
    counterpartSubtitle: 'Fattakhov HR Agency',
    counterpartLastSeen: null,
    status: 'VIEWED',
    lastMessageBody: last?.body ?? null,
    lastMessageAuthor: last ? (last.author === 'STUDENT' ? 'STUDENT' : 'EMPLOYER') : null,
    lastMessageAt: last?.createdAt ?? null,
    unread: 0,
    canWrite: source.canWrite,
    lockedReason: source.canWrite ? null : 'Агентство ещё не писало вам: ответить можно после его сообщения',
    messages: source.messages.map((m: AgencyMessageDTO) => ({
      id: m.id,
      author: m.author === 'STUDENT' ? 'STUDENT' : 'EMPLOYER',
      // Подпись сотрудника — в тексте реплики: в ленте других подписей у автора нет
      body: m.author === 'AGENCY' && m.staffName && m.staffName !== AGENCY_NAME ? `${m.staffName}: ${m.body}` : m.body,
      createdAt: m.createdAt,
      readAt: m.readAt,
      mine: m.author === 'STUDENT',
    })),
  };
}

export function AgencyChat({ initial }: { initial: AgencyThreadDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [source, setSource] = useState(initial);
  const [pending, setPending] = useState<PendingMessageDTO[]>([]);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/messages/agency');
      if (!response.ok) return;
      const data = (await response.json()) as { thread: AgencyThreadDTO };
      setSource(data.thread);
    } catch {
      /* сеть моргнула — следующий проход сверит состояние */
    }
  }, []);

  // Простой опрос: беседа редкая, отдельный поток событий под неё не нужен
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function deliver(item: PendingMessageDTO) {
    try {
      const response = await fetch('/api/messages/agency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: item.body }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Не удалось отправить'));
      await refresh();
      setPending((current) => current.filter((m) => m.id !== item.id));
    } catch (error) {
      setPending((current) => current.map((m) => (m.id === item.id ? { ...m, failed: true } : m)));
      toast.error(
        'Сообщение не отправлено',
        error instanceof Error && error.message ? error.message : 'Проверьте соединение: текст остался в диалоге',
      );
    }
  }

  function send(body: string) {
    const item: PendingMessageDTO = {
      id: `pending-${++sequence.current}`,
      applicationId: 'agency',
      author: 'STUDENT',
      body,
      createdAt: new Date().toISOString(),
      readAt: null,
      mine: true,
    };
    setPending((current) => [...current, item]);
    void deliver(item);
  }

  function retry(id: string) {
    const item = pending.find((m) => m.id === id);
    if (!item) return;
    const next = { ...item, failed: false, createdAt: new Date().toISOString() };
    setPending((current) => current.map((m) => (m.id === id ? next : m)));
    void deliver(next);
  }

  return (
    <div className="-mx-[var(--page-gutter)] h-[calc(100dvh-var(--header-h)-4rem)] overflow-hidden lg:surface lg:mx-0 lg:h-[calc(100dvh-var(--header-h)-7rem)] lg:min-h-[30rem] lg:rounded-3xl">
      <Conversation
        thread={toThread(source)}
        pending={pending}
        onSend={send}
        onRetry={retry}
        onDiscard={(id) => setPending((current) => current.filter((m) => m.id !== id))}
        onBack={() => router.push('/messages')}
        hideStatus
      />
    </div>
  );
}
