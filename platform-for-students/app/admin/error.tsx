'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/** Сбой страницы администратора: шапка панели остаётся на месте. */
export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} home={{ href: '/admin', label: 'В панель' }} />;
}
