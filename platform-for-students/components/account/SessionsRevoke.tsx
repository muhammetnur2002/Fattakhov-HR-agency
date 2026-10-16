'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { forgetThisDevice } from '@/lib/push/client';

/**
 * «Выйти на всех устройствах» — на случай, если кажется, что сессию украли
 * (вредоносная программа на компьютере, чужой доступ). Пароль не меняется,
 * но входить заново придётся везде, включая это устройство.
 */
export function SessionsRevoke({ className }: { className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function revoke() {
    if (!window.confirm('Выйти на всех устройствах? Вам придётся войти заново везде, в том числе здесь.')) return;
    setPending(true);
    try {
      // Пока сессия жива: после отзыва сервер уже не примет отписку от пуша
      await forgetThisDevice();
      const response = await fetch('/api/auth/sessions', { method: 'POST' });
      if (!response.ok) throw new Error(String(response.status));
      router.push('/login?reason=sessions-revoked');
      router.refresh();
    } catch {
      setPending(false);
      toast.error('Не получилось', 'Попробуйте ещё раз чуть позже.');
    }
  }

  return (
    <div className={className}>
      <p className="text-small leading-relaxed text-paper-dim">
        Если подозреваете, что кто-то вошёл в ваш аккаунт, завершите все сессии. Пароль не изменится, а войти придётся заново везде.
      </p>
      <Button variant="outline" size="sm" className="mt-4" loading={pending} onClick={() => void revoke()} icon={<LogOut />}>
        Выйти на всех устройствах
      </Button>
    </div>
  );
}
