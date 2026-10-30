import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/screens/LoginForm';
import { isDemoMode } from '@/lib/db';
import { DEMO_CREDENTIALS } from '@/lib/db/seed-data';
import { agencySiteUrl } from '@/lib/agency';
import { NOINDEX_METADATA } from '@/lib/seo';

export const metadata: Metadata = { title: 'Вход', ...NOINDEX_METADATA };

export default async function LoginPage() {

  // Подсказка с демо-доступами появляется только там, где база не
  // подключена, — то есть в демонстрационном режиме. На настоящих
  // данных таких аккаунтов не существует.
  const demoHint = isDemoMode()
    ? {
        student: { ...DEMO_CREDENTIALS.student },
        employerCode: DEMO_CREDENTIALS.employerCode,
      }
    : undefined;

  return (
    <Suspense>
      <LoginForm demoHint={demoHint} agencyUrl={agencySiteUrl()} />
    </Suspense>
  );
}
