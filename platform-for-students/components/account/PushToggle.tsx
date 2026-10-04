'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { endpointFingerprint, pushSupport, subscribedWithKey, type PushSupport } from '@/lib/push/client';
import { enablePushHere } from '@/lib/push/enable';
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

  async function subscribe(publicKey: string): Promise<void> {
    const { warning } = await enablePushHere(publicKey);
    if (warning) toast.show({ tone: 'info', title: 'Уведомления включены', description: warning });
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

  async function sendTest() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/account/push/test', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { devices?: number; sent?: number; removed?: number; failed?: number };
      if (!response.ok) throw new Error('Не удалось отправить проверочное уведомление.');
      if (!data.devices) toast.error('Нет подписанных устройств', 'Включите уведомления на этом устройстве выключателем выше');
      else if (data.sent) {
        toast.success('Отправлено', `Служба уведомлений приняла сообщение для устройств: ${data.sent} из ${data.devices}. Если на экране ничего нет, проверьте разрешения браузера и системы для этого сайта.`);
      } else {
        toast.error('Не доставлено', 'Служба уведомлений не приняла сообщение. Отключите и включите уведомления на этом устройстве ещё раз.');
      }
    } catch (error) {
      toast.error('Не получилось', error instanceof Error ? error.message : 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
      await refresh();
    }
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
        {view.kind === 'ready' && view.enabled && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void sendTest()}
            className="mt-2 text-[12.5px] text-paper underline underline-offset-4 disabled:opacity-50"
          >
            Отправить проверочное уведомление
          </button>
        )}
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
