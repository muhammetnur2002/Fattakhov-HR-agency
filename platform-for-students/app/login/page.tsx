import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/screens/LoginForm';
import { isDemoMode } from '@/lib/db';
import { DEMO_CREDENTIALS } from '@/lib/db/seed-data';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
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
      <LoginForm demoHint={demoHint} />
    </Suspense>
  );
}
