'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/** Сбой страницы работодателя: шапка кабинета остаётся на месте. */
export default function EmployerError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} home={{ href: '/employer', label: 'В кабинет' }} />;
}
