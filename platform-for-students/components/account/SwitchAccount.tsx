'use client';

import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Button, ButtonLink } from '@/components/ui/Button';
import { forgetThisDevice } from '@/lib/push/client';
import { roleLoginUrl, type EntryRole } from '@/lib/auth-entry';
import type { Role } from '@/lib/types';

export function SwitchAccount({ currentRole, targetRole, cancelHref }: { currentRole: Role; targetRole: EntryRole; cancelHref: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const current = currentRole === 'STUDENT' ? 'студент' : currentRole === 'EMPLOYER' ? 'работодатель' : 'сотрудник агентства';
  const target = targetRole === 'EMPLOYER' ? 'работодатель' : 'студент';
  async function changeAccount() {
    setPending(true); setError('');
    try {
      await forgetThisDevice();
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout');
      window.location.assign(roleLoginUrl(targetRole));
    } catch { setError('Не удалось выйти. Проверьте соединение и попробуйте ещё раз.'); setPending(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center px-5 py-16">
    <div className="w-full max-w-md">
      <div className="mb-8 flex justify-center"><Logo /></div>
      <section className="glass rounded-3xl p-6 sm:p-8">
        <h1 className="text-title">Сменить аккаунт?</h1>
        <p className="mt-4 text-body text-paper-dim">Вы вошли как {current}. Выйти и войти как {target}?</p>
        <p className="mt-3 text-small text-paper-faint">Ваш профиль и данные сохранятся. Для другого кабинета нужен отдельный аккаунт.</p>
        {error && <p role="alert" className="mt-4 text-small text-danger">{error}</p>}
        <div className="mt-6 flex flex-col gap-3">
          <Button loading={pending} onClick={() => void changeAccount()}>Выйти и продолжить</Button>
          {!pending && <ButtonLink href={cancelHref} variant="outline">Остаться в своём кабинете</ButtonLink>}
        </div>
      </section>
    </div>
  </main>;
}
