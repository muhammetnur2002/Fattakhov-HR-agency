import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { ListPanel } from '@/components/layout/ListPanel';
import { countUnread } from '@/lib/chat';
import { employerNav } from '@/lib/employer-nav';
import { requireEmployerPage } from '@/lib/security/guards';
import { buildEmployerBoard, listEmployerVacancies } from '@/lib/services';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL } from '@/lib/types';

export const metadata: Metadata = { title: 'Статистика работодателя' };
export const dynamic = 'force-dynamic';

export default async function EmployerStatisticsPage() {
  const { employer } = await requireEmployerPage('/employer/statistics');
  const [board, vacancies, unread] = await Promise.all([
    buildEmployerBoard(employer.id), listEmployerVacancies(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
  ]);
  const total = board.applications.length;
  const metrics = [
    ['Отклики', total],
    ['Новые', board.applications.filter(a => a.status === 'NEW').length],
    ['Вакансии', vacancies.length],
    ['Опубликованы', vacancies.filter(v => v.status === 'PUBLISHED').length],
    ['Собеседования', board.applications.filter(a => a.status === 'INTERVIEW').length],
    ['Вышли на работу', board.applications.filter(a => a.status === 'HIRED').length],
  ] as const;
  return <AppShell panel user={{ name: employer.companyName, subtitle: employer.contactName, href: '/employer/company' }} nav={employerNav(total, unread)}>
    <ListPanel className="mx-auto max-w-3xl" toolbar={<header><h1 className="text-title sm:text-headline">Статистика</h1><p className="mt-1 text-small text-paper-dim">Текущее состояние ваших вакансий и откликов</p></header>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map(([label, value]) => <div key={label} className="glass-card rounded-2xl p-4"><p className="text-headline tabular-nums">{value}</p><p className="mt-1 text-caption text-paper-dim">{label}</p></div>)}
      </div>
      <section className="mt-5 rounded-2xl border border-[var(--hairline)] p-4">
        <h2 className="text-body font-semibold">Отклики по этапам</h2>
        <p className="mt-1 text-caption text-paper-faint">Текущие статусы, не история переходов</p>
        <div className="mt-4 space-y-4">{APPLICATION_STATUSES.map(status => {
          const count = board.applications.filter(a => a.status === status).length;
          return <div key={status}><div className="mb-1.5 flex justify-between gap-3 text-small"><span>{APPLICATION_STATUS_LABEL[status]}</span><span className="tabular-nums">{count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-paper/10"><div className="h-full rounded-full bg-accent-400" style={{ width: `${total ? count / total * 100 : 0}%` }} /></div></div>;
        })}</div>
      </section>
    </ListPanel>
  </AppShell>;
}
