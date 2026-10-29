import type { Metadata } from 'next';
import { CompanyRegistrationForm } from '@/components/screens/CompanyRegistrationForm';
import { NOINDEX_METADATA } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Регистрация компании',
  ...NOINDEX_METADATA,
  description: 'Кабинет работодателя: страница компании, вакансии и отклики студентов.',
};

export default function CompanyRegisterPage() {
  return <CompanyRegistrationForm />;
}
