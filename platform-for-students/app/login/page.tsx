import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/screens/LoginForm';
import { isDemoMode } from '@/lib/db';
import { DEMO_CREDENTIALS } from '@/lib/db/seed-data';
import { agencySiteUrl } from '@/lib/agency';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage({ searchParams }: { searchParams: { role?: string } }) {
  // Работодатель на платформе не входит: его кабинет — в CRM. Сюда его
  // приводят закладки и старые письма со ссылкой на вход компании
  const agency = agencySiteUrl();
  if (searchParams.role === 'employer' && agency) redirect(`${agency}/login`);

  // Подсказка с демо-доступами появляется только там, где база не
  // подключена, — то есть в демонстрационном режиме. На настоящих
  // данных таких аккаунтов не существует.
  const demoHint = isDemoMode()
    ? {
        student: { ...DEMO_CREDENTIALS.student },
        admin: { ...DEMO_CREDENTIALS.admin },
        employerCode: DEMO_CREDENTIALS.employerCode,
      }
    : undefined;

  return (
    <Suspense>
      <LoginForm demoHint={demoHint} agencyUrl={agencySiteUrl()} />
    </Suspense>
  );
}
