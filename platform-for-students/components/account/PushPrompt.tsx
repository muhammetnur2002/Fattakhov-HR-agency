'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { endpointFingerprint, pushSupport, subscribedWithKey, type PushSupport } from '@/lib/push/client';
import { enablePushHere } from '@/lib/push/enable';

type ServerState = { configured: boolean; publicKey: string | null; devices: { endpointHash: string }[] };

type View =
  | { kind: 'hidden' }
  | { kind: 'ask'; publicKey: string }
  | { kind: 'hint'; text: string };

const COPY = {
  student: 'Когда вас пригласили, посмотрели отклик или написал работодатель — сообщим сразу, не заходя на почту.',
  company: 'Когда студент откликнулся или написал — сообщим сразу, не заходя на почту.',
};

const HINTS: Record<Exclude<PushSupport, 'supported' | 'unsupported'>, string> = {
  'in-app':
    'Сейчас платформа открыта во встроенном браузере приложения — там уведомления не работают. Откройте её в обычном браузере.',
  'ios-browser':
    'На iPhone и iPad уведомления приходят, если добавить платформу на экран «Домой»: «Поделиться» → «На экран “Домой”», затем откройте её оттуда.',
  'ios-outdated': 'Для уведомлений на iPhone и iPad нужна iOS 16.4 или новее. Обновите систему.',
};

/**
 * Предложение разрешить уведомления от платформы — плашка над содержимым.
 *
 * Показывается при каждом заходе, пока устройство не подписано. «Закрыть» прячет
 * её до конца этого визита (вкладки); с галочкой «Больше не показывать» — навсегда
 * на этом устройстве. Подписка — свойство браузера, поэтому и отказ хранится
 * в браузере, отдельно для каждой учётной записи.
 */
export function PushPrompt({ accountId, audience }: { accountId: string; audience: 'student' | 'company' }) {
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: 'hidden' });
  const [never, setNever] = useState(false);
  const [busy, setBusy] = useState(false);
  const storageKey = `fhr-push-prompt:${accountId}`;

  useEffect(() => {
    let cancelled = false;
    const show = (next: View) => {
      if (!cancelled) setView(next);
    };
    void (async () => {
      try {
        if (localStorage.getItem(storageKey) === 'never' || sessionStorage.getItem(storageKey) === 'later') return;
      } catch {
        /* хранилище закрыто — показываем как обычно */
      }
      try {
        const response = await fetch('/api/account/push', { cache: 'no-store' });
        if (!response.ok) return;
        const server = (await response.json()) as ServerState;
        if (!server.configured || !server.publicKey) return;

        const support = pushSupport();
        if (support === 'unsupported') return;
        if (support !== 'supported') return show({ kind: 'hint', text: HINTS[support] });
        if (Notification.permission === 'denied') {
          return show({
            kind: 'hint',
            text: 'Уведомления запрещены в настройках браузера для этого сайта. Разрешите их там и обновите страницу.',
          });
        }

        // Уже подписано — и в браузере (на нынешний ключ), и у сервера: предлагать нечего
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription && subscribedWithKey(subscription, server.publicKey)) {
          const hash = await endpointFingerprint(subscription.endpoint);
          if (server.devices.some((d) => d.endpointHash === hash)) return;
        }
        show({ kind: 'ask', publicKey: server.publicKey });
      } catch {
        /* без предложения — не беда */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  function close() {
    try {
      if (never) localStorage.setItem(storageKey, 'never');
      else sessionStorage.setItem(storageKey, 'later');
    } catch {
      /* не запомнилось — в следующий раз покажем снова */
    }
    setView({ kind: 'hidden' });
  }

  async function enable() {
    if (view.kind !== 'ask' || busy) return;
    setBusy(true);
    try {
      const { warning } = await enablePushHere(view.publicKey);
      if (warning) toast.show({ tone: 'info', title: 'Уведомления включены', description: warning });
      else toast.success('Уведомления включены', 'Проверочное уведомление отправлено');
      setView({ kind: 'hidden' });
    } catch (error) {
      toast.error('Не получилось', error instanceof Error ? error.message : 'Попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === 'hidden') return null;

  return (
    <div
      role="region"
      aria-label="Уведомления"
      className="mb-6 rounded-2xl border border-accent-300/35 bg-accent-500/[0.08] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-accent-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-paper">
            {view.kind === 'ask' ? 'Разрешите уведомления от платформы' : 'Уведомления от платформы'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-paper-dim">
            {view.kind === 'ask' ? COPY[audience] : view.text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {view.kind === 'ask' && (
              <Button type="button" size="sm" loading={busy} onClick={() => void enable()}>
                Разрешить уведомления
              </Button>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-paper-dim">
              <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="size-4" />
              Больше не показывать
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={never ? 'Закрыть и больше не показывать' : 'Закрыть до следующего захода'}
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-paper-faint transition-colors hover:text-paper"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
