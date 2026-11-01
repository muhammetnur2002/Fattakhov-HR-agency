import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { SecurityDecisionForm } from '@/components/screens/SecurityDecisionForm';
import { adminNav } from '@/lib/admin-nav';
import { prisma } from '@/lib/db/prisma-client';
import { requireAdminPage } from '@/lib/security/guards';
import { securityAccess } from '@/lib/security/incidents';
import { contentCheckConfiguration } from '@/lib/security/content-checks';
import { decrypt } from '@/lib/security/crypto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Безопасность чатов' };

export default async function SecurityPage() {
  const session = await requireAdminPage('/admin/security');
  if (!(await securityAccess()).access) redirect('/admin');
  const config = contentCheckConfiguration();
  const database = Boolean(process.env.DATABASE_URL);
  const incidents = database ? await prisma.securityIncident.findMany({ orderBy: { createdAt: 'desc' }, take: 50,
    include: { actions: { orderBy: { createdAt: 'asc' } }, mail: true } }) : [];
  const rows = [
    ['Антивирус', config.malware], ['Модерация изображений', config.images], ['Проверка ссылок', config.links],
    ['Уведомления по почте', !!(process.env.SMTP_URL && process.env.SMTP_FROM)], ['Планировщик уведомлений', !!process.env.CRON_SECRET], ['Хранение журнала', database],
  ] as const;
  return <AppShell user={{ name: session.name, subtitle: 'Безопасность' }} nav={adminNav(0, 0, session.permissions)} wide>
    <Link href="/admin" className="text-small text-paper-dim">← Панель HR</Link>
    <h1 className="mt-4 text-headline">Безопасность чатов</h1>
    <p className="mt-3 max-w-2xl text-small text-paper-dim">Вложения отключены. Ключи сервисов сами по себе не включают отправку: перед запуском нужны проверка закрытого хранилища и испытания всей цепочки. Внешние ссылки в чатах остаются текстом.</p>
    <dl className="mt-5 grid gap-2 sm:grid-cols-2">
      {rows.map(([label, configured]) => <div key={label} className="flex justify-between gap-3 rounded-xl border border-[var(--hairline)] p-3 text-small">
        <dt>{label}</dt><dd className={configured ? 'text-paper-dim' : 'text-warn'}>{configured ? 'Настройки есть' : 'Не настроено'}</dd>
      </div>)}
    </dl>
    <SecurityDecisionForm />
    <h2 className="mt-8 text-title">Журнал событий</h2>
    <p className="mt-2 text-small text-paper-dim">Последние 50 событий. Наличие настроек не подтверждает работу сервиса. Блокировка — только после проверки человеком; спорное решение можно отменить с указанием причины.</p>
    {!incidents.length && <p className="mt-5 text-small">Событий пока нет. Это не означает, что проверка вложений уже работает.</p>}
    <div className="mt-4 grid gap-4">
      {incidents.map(incident => <article key={incident.id} className="surface min-w-0 rounded-2xl p-4">
        <h3 className="font-semibold">{incident.kind === 'MALWARE' ? 'Файл отклонён антивирусом' : 'Ссылка отклонена правилами'}</h3>
        <p className="mt-1 text-caption text-paper-faint">{incident.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} · {incident.id}</p>
        <details className="mt-3 text-small"><summary className="cursor-pointer">Данные события (ограниченный доступ)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-graphite-900 p-3 text-caption">{decrypt(incident.evidenceEnc)}</pre>
        </details>
        {incident.mail && <p className="mt-2 text-small">Уведомление: {incident.mail.sentAt ? 'отправлено' : 'в очереди'} · попыток: {incident.mail.attempts}</p>}
        {incident.actions.map(action => <p key={action.id} className="mt-2 break-words text-small text-paper-dim">
          {({ reviewed: 'Проверено', suspend: 'Аккаунт отключён', restore: 'Доступ восстановлен' } as Record<string, string>)[action.action]} · {decrypt(action.reasonEnc)}
        </p>)}
        <SecurityDecisionForm incidentId={incident.id} malware={incident.kind === 'MALWARE'} />
      </article>)}
    </div>
  </AppShell>;
}
