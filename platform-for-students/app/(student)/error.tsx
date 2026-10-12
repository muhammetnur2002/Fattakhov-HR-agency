'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/** Сбой страницы студента: шапка и вкладки каркаса остаются на месте. */
export default function StudentError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} home={{ href: '/feed', label: 'В ленту вакансий' }} />;
}
