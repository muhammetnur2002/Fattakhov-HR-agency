import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/screens/ForgotPasswordForm';
import { NOINDEX_METADATA } from '@/lib/seo';

export const metadata: Metadata = { title: 'Восстановление пароля', ...NOINDEX_METADATA };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
