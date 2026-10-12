'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/** Сбой страницы вне разделов с каркасом (главная, вход, регистрация, вакансии компаний). */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} home={{ href: '/', label: 'На главную' }} fullPage />;
}
