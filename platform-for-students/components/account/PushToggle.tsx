'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  applicationServerKey,
  endpointFingerprint,
  pushSupport,
  registerPushWorker,
  subscribedWithKey,
  type PushSupport,
} from '@/lib/push/client';
import { cn } from '@/lib/utils';

type ServerState = { configured: boolean; publicKey: string | null; devices: { id: string; endpointHash: string }[] };

type View =
  | { kind: 'loading' }
  /** На сервере канала нет — блок не показываем вовсе. */
  | { kind: 'hidden' }
  | { kind: 'blocked'; text: string }
  | { kind: 'ready'; enabled: boolean };

const COPY = {
  student: 'Когда вас пригласили, посмотрели отклик или написал работодатель — сразу на телефон или компьютер.',
  company: 'Когда студент откликнулся или написал — сразу на телефон или компьютер.',
};

const UNSUPPORTED_TEXT: Record<Exclude<PushSupport, 'supported'>, string> = {
  unsupported: 'Этот браузер не умеет присылать уведомления. Откройте платформу в Chrome, Safari или Яндекс Браузере.',
  'in-app': 'Уведомления не работают во встроенном браузере приложения. Откройте платформу в обычном браузере.',
  'ios-browser':
    'На iPhone и iPad уведомления приходят, если добавить платформу на экран «Домой»: «Поделиться» → «На экран “Домой”», затем откройте её оттуда.',
  'ios-outdated': 'Для уведомлений нужна iOS 16.4 или новее. Обновите систему.',
};

/**
 * Пуш-уведомления на это устройство — переключатель.
 *
 * Состояние складывается из трёх источников: есть ли канал на сервере,
 * что разрешил браузер и числится ли это устройство у сервера (по
 * отпечатку адреса подписки: сам адрес в ответ сервера не попадает).
 * «Включено» — только когда подписка есть и в браузере, и на сервере.
 */
export function PushToggle({ audience, bordered = true }: { audience: 'student' | 'company'; bordered?: boolean }) {
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/account/push', { cache: 'no-store' });
      if (!response.ok) return setView({ kind: 'hidden' });
      const server = (await response.json()) as ServerState;
      if (!server.configured || !server.publicKey) return setView({ kind: 'hidden' });

      const support = pushSupport();
      if (support !== 'supported') return setView({ kind: 'blocked', text: UNSUPPORTED_TEXT[support] });
      if (Notification.permission === 'denied') {
        return setView({
          kind: 'blocked',
          text: 'Уведомления запрещены в настройках браузера для этого сайта. Разрешите их там и обновите страницу.',
        });
      }

      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      // «Включено» — подписка есть и в браузере (на нынешний ключ), и у сервера
      let enabled = false;
      if (subscription && subscribedWithKey(subscription, server.publicKey)) {
        const hash = await endpointFingerprint(subscription.endpoint);
        enabled = server.devices.some((d) => d.endpointHash === hash);
      }
      setView({ kind: 'ready', enabled });
    } catch {
      setView({ kind: 'hidden' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function subscribe(publicKey: string, retry = true): Promise<void> {
    const registration = await registerPushWorker();
    if (!registration) throw new Error('Не удалось запустить службу уведомлений в этом браузере.');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Вы не разрешили уведомления в браузере.');

    // Подписка на прежний ключ сервера после его смены бесполезна — заменяем
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscribedWithKey(subscription, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    });

    const response = await fetch('/api/account/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: string; warning?: string; error?: string; code?: string };

    // Служба уведомлений не узнала подписку: браузер держит отмершую — один раз заменяем
    if (response.status === 409 && data.code === 'RESUBSCRIBE' && retry) {
      await subscription.unsubscribe();
      return subscribe(publicKey, false);
    }
    if (!response.ok) throw new Error(data.error ?? 'Не удалось включить уведомления.');
    if (data.warning) toast.show({ tone: 'info', title: 'Уведомления включены', description: data.warning });
    else toast.success('Уведомления включены', 'Проверочное уведомление отправлено');
  }

  async function unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch('/api/account/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    toast.success('Уведомления выключены', 'На этом устройстве больше не придут');
  }

  async function toggle() {
    if (view.kind !== 'ready' || saving) return;
    setSaving(true);
    try {
      if (view.enabled) {
        await unsubscribe();
      } else {
        const response = await fetch('/api/account/push', { cache: 'no-store' });
        const server = (await response.json()) as ServerState;
        if (!server.publicKey) throw new Error('Уведомления на сервере не подключены.');
        await subscribe(server.publicKey);
      }
    } catch (error) {
      toast.error('Не получилось', error instanceof Error ? error.message : 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
      await refresh();
    }
  }

  if (view.kind === 'loading' || view.kind === 'hidden') return null;

  return (
    <div className={cn('flex items-start justify-between gap-4', bordered && 'border-t border-[var(--hairline)] pt-4')}>
      <div className="min-w-0">
        <p id={`notify-push-${audience}`} className="text-[13.5px] text-paper">
          Уведомления на это устройство
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-paper-faint">
          {view.kind === 'blocked' ? view.text : COPY[audience]}
        </p>
      </div>
      {view.kind === 'ready' && (
        <button
          type="button"
          role="switch"
          aria-checked={view.enabled}
          aria-labelledby={`notify-push-${audience}`}
          disabled={saving}
          onClick={() => void toggle()}
          className={cn(
            'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
            view.enabled ? 'border-accent-300/60 bg-accent-500' : 'border-[var(--hairline-strong)] bg-paper/10',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'inline-block size-4 rounded-full bg-paper shadow transition-transform',
              view.enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      )}
    </div>
  );
}
