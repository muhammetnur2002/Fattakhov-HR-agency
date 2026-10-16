import type { Metadata } from 'next';
import { RegistrationWizard } from '@/components/screens/RegistrationWizard';
import { NOINDEX_METADATA } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Регистрация студента',
  description: 'Пять коротких шагов — и лента вакансий собирается под ваш график.',
  ...NOINDEX_METADATA,
};

export default function RegisterPage() {
  return <RegistrationWizard />;
}
