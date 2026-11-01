'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api-client';

export function SecurityDecisionForm({ incidentId, malware }: { incidentId?: string; malware?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const action = incidentId ? String(data.get('action')) : 'retry-mail';
    if (action !== 'reviewed' && action !== 'retry-mail' && !window.confirm(action === 'suspend'
      ? 'Отключить аккаунт на студенческой платформе и завершить его сессии?'
      : 'Вернуть доступ к аккаунту? Пользователю потребуется войти заново.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/security', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incidentId ? { action, incidentId, reason: data.get('reason') } : { action }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Не удалось сохранить решение'));
      const result = await response.json();
      setMessage(action === 'retry-mail' ? (result.configured ? `Отправлено: ${result.sent}` : 'Почтовый сервис ещё не настроен') : 'Решение сохранено');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Попробуйте снова'); }
    finally { setBusy(false); }
  }}>
    {incidentId && <>
      <label className="text-small">Решение<select name="action" className="mt-1 block rounded-xl bg-graphite-900 p-2 text-body" disabled={busy}>
        <option value="reviewed">Проверено — без блокировки</option>
        {malware && <><option value="suspend">Отключить аккаунт</option><option value="restore">Вернуть доступ</option></>}
      </select></label>
      <label className="min-w-0 flex-1 text-small">Причина<input name="reason" required minLength={10} maxLength={1000} disabled={busy}
        className="mt-1 block w-full min-w-[180px] rounded-xl border border-[var(--hairline)] bg-transparent p-2 text-body" /></label>
    </>}
    <button disabled={busy} className="rounded-xl border border-[var(--hairline)] px-4 py-2 text-small disabled:opacity-50">
      {busy ? 'Подождите…' : incidentId ? 'Сохранить' : 'Повторить отправку уведомлений'}
    </button>
    <p role="status" className="w-full text-small text-paper-dim">{message}</p>
  </form>;
}
