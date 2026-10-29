'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, MapPin } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ApplicationStatusPill } from '@/components/ui/StatusPill';
import { Reveal, Stagger } from '@/components/motion/Reveal';
import { VacancyDetail } from '@/components/swipe/VacancyDetail';
import { EmptyState } from '@/components/ui/EmptyState';
import { fadeUp, springSoft } from '@/lib/motion';
import { daysUntil } from '@/lib/study';
import { cn, formatSalary, plural, timeAgo } from '@/lib/utils';
import {
  APPLICATION_FUNNEL,
  APPLICATION_STATUS_LABEL,
  type ApplicationDTO,
  type ApplicationStatus,
  type PendingApplicationDTO,
  type StudyStateDTO,
  type VacancyDTO,
} from '@/lib/types';

/**
 * Мои отклики.
 *
 * Главное здесь — не список вакансий, а стадия каждого отклика: студент
 * приходит сюда узнать «меня уже посмотрели?». Поэтому воронка нарисована
 * прямо в карточке, а не спрятана за статусом одним словом.
 *
 * Отклики, которые ждут подтверждения учёбы, — отдельным разделом сверху и
 * со сроком: иначе студент считал бы, что работодатель их видит и молчит.
 */
export function ApplicationsList({
  applications: initialApplications,
  pending: initialPending,
  study,
}: {
  applications: ApplicationDTO[];
  pending: PendingApplicationDTO[];
  study: StudyStateDTO;
}) {
  const router = useRouter();
  const toast = useToast();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const applications = initialApplications.filter((a) => !removed.has(a.vacancy.id));
  const pending = initialPending.filter((a) => !removed.has(a.vacancy.id));
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancelLock = useRef(false);
  async function cancel(vacancyId: string) {
    if (cancelLock.current) return;
    cancelLock.current = true;
    setCancelling(vacancyId);
    try {
      const response = await fetch('/api/swipes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Попробуйте ещё раз'));
      setRemoved((prev) => new Set(prev).add(vacancyId));
      toast.success('Отклик отменён', 'На активную вакансию можно откликнуться снова в ленте.');
      router.refresh();
    } catch (error) {
      toast.error('Не удалось отменить отклик', error instanceof Error ? error.message : 'Проверьте соединение');
    } finally {
      cancelLock.current = false;
      setCancelling(null);
    }
  }
  const [detail, setDetail] = useState<VacancyDTO | null>(null);

  if (applications.length === 0 && pending.length === 0) {
    return (
      <EmptyState
        title="Откликов пока нет"
        description={
          study.status === 'VERIFIED'
            ? 'Смахните карточку вправо в ленте — отклик уйдёт работодателю сразу, без сопроводительных писем.'
            : 'Смахните карточку вправо в ленте — отклик сохранится и уйдёт работодателю, как только HR-менеджер подтвердит учёбу.'
        }
        action={
          <ButtonLink href="/feed" size="lg" iconRight={<ArrowRight />}>
            В ленту вакансий
          </ButtonLink>
        }
      />
    );
  }

  const active = applications.filter((a) => !['HIRED', 'REJECTED'].includes(a.status)).length;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-headline text-paper">Мои отклики</h1>
        <p className="mt-2.5 text-body text-paper-dim">
          {applications.length} {plural(applications.length, 'отклик', 'отклика', 'откликов')}
          {active > 0 && ` · ${active} в работе`}
          {pending.length > 0 && ` · ${pending.length} ${plural(pending.length, 'ждёт', 'ждут', 'ждут')} подтверждения учёбы`}
        </p>
      </header>

      {pending.length > 0 && (
        <section className="mb-10">
          <h2 className="text-caption uppercase tracking-[0.12em] text-paper-faint">Ждут подтверждения учёбы</h2>
          <Link
            href="/profile#study"
            className="mt-3 block rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-small leading-snug text-paper-dim transition-colors hover:bg-warn/[0.13]"
          >
            {study.status === 'PENDING'
              ? 'Справка на проверке у HR-менеджера — после подтверждения эти отклики уйдут работодателям.'
              : 'Работодатели пока не видят эти отклики. Загрузите справку об обучении в профиле — после проверки они уйдут сами.'}
          </Link>
          <div className="mt-3 grid gap-3 [&>*]:min-w-0">
            {pending.map((item) => (
              <div key={item.vacancy.id}><PendingCard item={item} onOpen={() => setDetail(item.vacancy)} />
                <CancelApplication busy={cancelling === item.vacancy.id} disabled={cancelling !== null} onCancel={() => cancel(item.vacancy.id)} /></div>
            ))}
          </div>
        </section>
      )}

      {applications.length > 0 && (
        <Stagger className="grid gap-3 [&>*]:min-w-0" each={0.06} inView={false}>
          {applications.map((application) => (
            <Reveal key={application.id} variants={fadeUp}>
              <ApplicationCard application={application} onOpen={() => setDetail(application.vacancy)} />
              <CancelApplication busy={cancelling === application.vacancy.id} disabled={cancelling !== null} onCancel={() => cancel(application.vacancy.id)} />
            </Reveal>
          ))}
        </Stagger>
      )}

      <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function PendingCard({ item, onOpen }: { item: PendingApplicationDTO; onOpen: () => void }) {
  const { vacancy } = item;
  const left = daysUntil(new Date(item.expiresAt));

  return (
    <article className="surface min-w-0 overflow-hidden rounded-3xl">
      <button type="button" onClick={onOpen} className="block w-full rounded-3xl p-5 text-left -outline-offset-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={vacancy.company} src={vacancy.companyLogoUrl} size={46} rounded="square" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-small text-paper-faint">{vacancy.company}</p>
            <h3 className="mt-0.5 truncate text-body font-semibold tracking-[-0.02em] text-paper">{vacancy.title}</h3>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-paper-dim">
              <span className="text-accent-200">{formatSalary(vacancy.salaryFrom, vacancy.salaryTo)}</span>
              <span className="flex items-center gap-1 text-paper-faint">
                <MapPin className="size-3" aria-hidden />
                {vacancy.city}
              </span>
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-caption leading-snug text-warn">
          <Clock3 className="mt-px size-3.5 shrink-0" aria-hidden />
          Уйдёт работодателю после подтверждения учёбы.{' '}
          {left > 0
            ? `Удалится через ${left} ${plural(left, 'день', 'дня', 'дней')}, если учёбу не подтвердят.`
            : 'Удалится сегодня, если учёбу не подтвердят.'}
        </p>
      </button>
    </article>
  );
}

function ApplicationCard({
  application,
  onOpen,
}: {
  application: ApplicationDTO;
  onOpen: () => void;
}) {
  const { vacancy } = application;

  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={springSoft}
      className="surface min-w-0 overflow-hidden rounded-3xl"
    >
      <button type="button" onClick={onOpen} className="block w-full rounded-3xl p-5 text-left -outline-offset-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={vacancy.company} src={vacancy.companyLogoUrl} size={46} rounded="square" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-small text-paper-faint">{vacancy.company}</p>
            <h2 className="mt-0.5 truncate text-body font-semibold tracking-[-0.02em] text-paper">
              {vacancy.title}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-paper-dim">
              <span className="text-accent-200">{formatSalary(vacancy.salaryFrom, vacancy.salaryTo)}</span>
              <span className="flex items-center gap-1 text-paper-faint">
                <MapPin className="size-3" aria-hidden />
                {vacancy.city}
              </span>
            </p>
          </div>

          <ApplicationStatusPill status={application.status} className="shrink-0" />
        </div>

        <Funnel status={application.status} />

        <p className="mt-3 text-caption text-paper-faint">
          Отклик отправлен {timeAgo(application.createdAt)}
          {application.status !== 'NEW' && ` · статус обновлён ${timeAgo(application.statusChangedAt)}`}
        </p>

        {application.employerNote && (
          <p className="mt-3 rounded-xl border border-[var(--hairline)] bg-graphite-950/50 p-3 text-small leading-relaxed text-paper-dim">
            {application.employerNote}
          </p>
        )}
      </button>
    </motion.article>
  );
}

/**
 * Воронка отклика.
 *
 * Отказ не рисуется как «шаг назад»: этап, на котором всё закончилось,
 * подсвечивается серым, а не красным. Отказ на собеседовании и отказ
 * сразу — разные вещи, и это должно быть видно.
 */
function Funnel({ status }: { status: ApplicationStatus }) {
  const rejected = status === 'REJECTED';
  const index = rejected ? -1 : APPLICATION_FUNNEL.indexOf(status);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-1">
        {APPLICATION_FUNNEL.map((stage, position) => {
          const reached = !rejected && position <= index;
          return (
            <div key={stage} className="flex flex-1 items-center gap-1">
              <motion.span
                initial={false}
                animate={{
                  backgroundColor: reached
                    ? position === index
                      ? 'rgba(141,163,185,0.95)'
                      : 'rgba(110,136,162,0.55)'
                    : 'rgba(248,248,248,0.1)',
                }}
                transition={{ duration: 0.5, delay: position * 0.05 }}
                className={cn('h-1 flex-1 rounded-full', position === index && 'shadow-glow-accent')}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-caption text-paper-faint">
        {rejected
          ? 'Работодатель отказал — вакансия закрыта для вас'
          : `Этап: ${APPLICATION_STATUS_LABEL[status]}`}
      </p>
    </div>
  );
}

function CancelApplication({ busy, disabled, onCancel }: { busy: boolean; disabled: boolean; onCancel: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  return <div className="px-5 py-3">
    {confirm ? <div className="flex flex-wrap items-center gap-3">
      <p className="text-small text-paper-dim">Отменить отклик? Переписка по нему тоже будет удалена.</p>
      <Button size="sm" variant="danger" loading={busy} disabled={disabled} onClick={onCancel}>Да, отменить</Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirm(false)}>Оставить отклик</Button>
    </div> : <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirm(true)}>Отменить отклик</Button>}
  </div>;
}
