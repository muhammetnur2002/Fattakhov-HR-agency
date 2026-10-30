'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SessionsRevoke } from './SessionsRevoke';
import { forgetThisDevice } from '@/lib/push/client';

export function LogoutSection() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    // Пока сессия жива: после выхода сервер уже не примет отписку
    await forgetThisDevice();
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/');
    router.refresh();
  }

  return (
    <section className="rounded-3xl border border-[var(--hairline)] bg-graphite-900/40 p-6 sm:p-7">
      <h2 className="mb-2 flex items-center gap-2 text-caption uppercase tracking-[0.12em] text-paper-faint">
        <LogOut className="size-3.5" aria-hidden />
        Выход из аккаунта
      </h2>
      <p className="text-small leading-relaxed text-paper-dim">
        Вы выйдете на этом устройстве. Вернуться можно в любой момент — по почте и паролю.
      </p>
      <Button variant="outline" size="sm" className="mt-5" loading={pending} onClick={() => void logout()} icon={<LogOut />}>
        Выйти
      </Button>
      <SessionsRevoke className="mt-7 border-t border-[var(--hairline)] pt-6" />
    </section>
  );
}

