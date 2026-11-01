'use client';

import { ListPanel } from '@/components/layout/ListPanel';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Pencil, Plus, Send, Trash2, TriangleAlert } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { VacancyStatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import { plural, timeAgo } from '@/lib/utils';
import { EMPLOYMENT_TYPE_LABEL, type EmployerVacancyDTO, type ModerationStatus } from '@/lib/types';
import { SUBMITTABLE_STATUSES } from '@/lib/vacancy';

/** Что сейчас происходит с вакансией — словами, а не только цветом статуса. */
function statusHint(vacancy: EmployerVacancyDTO, companyStatus: ModerationStatus, skipsModeration: boolean): string {
  if (vacancy.fromCrm) {
    return vacancy.status === 'CLOSED'
      ? 'Закрыта в CRM. Вакансии из CRM ведёт агентство.'
      : 'В ленте у студентов. Изменения вносит агентство через CRM.';
  }
  switch (vacancy.status) {
    case 'DRAFT':
      return skipsModeration
        ? 'Черновик — студенты его не видят. Когда будет готово, опубликуйте.'
        : 'Черновик — студенты его не видят. Когда будет готово, отправьте на проверку.';
    case 'PENDING':
      return 'Ждёт проверки агентством. После одобрения появится в ленте.';
    case 'PUBLISHED':
      return companyStatus === 'APPROVED'
        ? 'В ленте у студентов.'
        : 'Одобрена, но скрыта, пока компания на проверке.';
    case 'REJECTED':
      return 'Агентство вернуло вакансию. Поправьте и отправьте снова.';
    case 'CLOSED':
      if (vacancy.keepAfterClose === false) {
        return 'Снята с публикации. Не сохранена — будет удалена автоматически через 3 дня, или удалите сейчас.';
      }
      if (vacancy.keepAfterClose === true) {
        return skipsModeration
          ? 'Снята с публикации и сохранена. Можно поправить и опубликовать снова или удалить.'
          : 'Снята с публикации и сохранена. Можно поправить и отправить на проверку снова или удалить.';
      }
      return skipsModeration
        ? 'Снята с публикации. Можно поправить и опубликовать снова.'
        : 'Снята с публикации. Можно поправить и отправить на проверку снова.';
  }
}

/**
 * Вакансии компании в кабинете.
 *
 * Статус каждой вакансии объяснён фразой: компания, которая видит
 * «на проверке» и не знает, что это значит, пишет в поддержку, а
 * компания, которая не видит причины отказа, — уходит.
 *
 * Снятие — в два нажатия: одно случайное касание на телефоне не должно
 * убирать вакансию из ленты.
 */
export function EmployerVacancies({
  vacancies,
  companyStatus,
  skipsModeration = false,
}: {
  vacancies: EmployerVacancyDTO[];
  companyStatus: ModerationStatus;
  /** У клиента CRM с действующим договором вакансии публикуются сразу — см. lib/vacancy.ts */
  skipsModeration?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [closing, setClosing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function act(vacancy: EmployerVacancyDTO, action: 'submit' | 'close' | 'delete', keep?: boolean) {
    setBusy((current) => new Set(current).add(vacancy.id));
    try {
      const response = await fetch(`/api/employer/vacancies/${vacancy.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(keep !== undefined ? { keep } : {}) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? 'Не удалось выполнить действие');
        return;
      }
      const messages = {
        close: 'Вакансия снята',
        submit: skipsModeration ? 'Вакансия опубликована' : 'Вакансия на проверке',
        delete: 'Вакансия удалена',
      };
      toast.success(messages[action], `«${vacancy.title}»`);
      setClosing(null);
      setDeleting(null);
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(vacancy.id);
        return next;
      });
    }
  }

  const newButton = (
    <ButtonLink href="/employer/vacancies/new" variant="accent" size="sm" className="shrink-0 px-3 text-caption" icon={<Plus />}>
      Новая вакансия
    </ButtonLink>
  );

  return (
    <ListPanel className="mx-auto w-full max-w-[52rem]" toolbar={<>
      <header className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 text-title text-paper sm:text-headline">Вакансии</h1>
        {newButton}
      </header>
      </>}>

      {companyStatus !== 'APPROVED' && (
        <div className="mb-6 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-small leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-warn">
            <Clock3 className="size-4 shrink-0" aria-hidden />
            {companyStatus === 'PENDING' ? 'Компания на проверке у агентства' : 'Компания не одобрена'}
          </p>
          <p className="mt-1.5 text-paper-dim">
            {companyStatus === 'PENDING'
              ? 'Вакансии можно готовить и отправлять на проверку — студенты увидят их после одобрения компании.'
              : 'Пока компания не одобрена, вакансии не публикуются. Подробности — в разделе «Компания».'}
          </p>
        </div>
      )}

      {vacancies.length === 0 ? (
        <EmptyState
          title="Вакансий пока нет"
          description={
            skipsModeration
              ? 'Создайте первую вакансию — студенты увидят её сразу, без проверки.'
              : 'Создайте первую вакансию — после проверки агентством её увидят студенты в ленте.'
          }
          action={newButton}
        />
      ) : (
        <ul className="grid gap-3">
          {vacancies.map((vacancy) => {
            const isBusy = busy.has(vacancy.id);
            return (
              <li key={vacancy.id} className="surface min-w-0 rounded-3xl p-5">
                {/* На телефоне статус над названием: в одну строку с бейджами
                    название сжималось до столбика и рвалось посреди слова */}
                <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                  <div className="min-w-0 sm:flex-1">
                    <h2 className="break-words text-body font-semibold tracking-[-0.02em] text-paper">
                      {vacancy.title}
                    </h2>
                    <p className="mt-1 text-small text-paper-faint">
                      {vacancy.city} · {EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]} · {vacancy.applications}{' '}
                      {plural(vacancy.applications, 'отклик', 'отклика', 'откликов')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {vacancy.fromCrm && <Tag>Из CRM</Tag>}
                    <VacancyStatusPill status={vacancy.status} />
                  </div>
                </div>

                <p className="mt-3 text-small leading-relaxed text-paper-dim">
                  {statusHint(vacancy, companyStatus, skipsModeration)}
                </p>

                {vacancy.moderationNote && (
                  <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-3 py-2.5 text-small leading-relaxed text-paper-dim">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-danger">Причина: </span>
                      {vacancy.moderationNote}
                    </span>
                  </p>
                )}

                {!vacancy.fromCrm &&
                  (closing === vacancy.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
                      <span className="mr-1 basis-full text-small text-paper-dim">
                        Закрыть вакансию? Студенты её не увидят, отклики сохранятся. Сохранить её в истории?
                      </span>
                      <Button variant="accent" size="sm" loading={isBusy} onClick={() => void act(vacancy, 'close', true)}>
                        Сохранить и закрыть
                      </Button>
                      <Button variant="danger" size="sm" loading={isBusy} onClick={() => void act(vacancy, 'close', false)}>
                        Не сохранять
                      </Button>
                      <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setClosing(null)}>
                        Отмена
                      </Button>
                    </div>
                  ) : deleting === vacancy.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
                      <span className="mr-1 basis-full text-small text-paper-dim">
                        Удалить вакансию навсегда? Отклики и переписка по ней исчезнут — это нельзя отменить.
                      </span>
                      <Button variant="danger" size="sm" loading={isBusy} onClick={() => void act(vacancy, 'delete')}>
                        Удалить
                      </Button>
                      <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setDeleting(null)}>
                        Отмена
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
                      <ButtonLink href={`/employer/vacancies/${vacancy.id}`} variant="outline" size="sm" icon={<Pencil />}>
                        Изменить
                      </ButtonLink>
                      {SUBMITTABLE_STATUSES.includes(vacancy.status) && (
                        <Button
                          variant="accent"
                          size="sm"
                          icon={<Send />}
                          loading={isBusy}
                          onClick={() => void act(vacancy, 'submit')}
                        >
                          {skipsModeration ? 'Опубликовать' : 'Отправить на проверку'}
                        </Button>
                      )}
                      {vacancy.status !== 'CLOSED' && (
                        <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setClosing(vacancy.id)}>
                          {vacancy.status === 'PUBLISHED' ? 'Снять с публикации' : 'Закрыть'}
                        </Button>
                      )}
                      {vacancy.status === 'CLOSED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 />}
                          disabled={isBusy}
                          onClick={() => setDeleting(vacancy.id)}
                        >
                          Удалить
                        </Button>
                      )}
                      <span className="ml-auto text-caption text-paper-faint">
                        Изменена {timeAgo(vacancy.updatedAt)}
                      </span>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </ListPanel>
  );
}
