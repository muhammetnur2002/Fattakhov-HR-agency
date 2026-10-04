import {
  applicationServerKey,
  registerPushWorker,
  subscribedWithKey,
} from '@/lib/push/client';

/**
 * Включить уведомления на этом устройстве: разрешение браузера, подписка,
 * сохранение у сервера. Общий путь для переключателя в профиле и плашки-
 * предложения. Ошибка — Error с текстом, который можно показать человеку.
 *
 * Разрешение спрашиваем первым делом, прямо из нажатия: Safari показывает
 * запрос только в ответ на жест, а ожидание сети или воркера до него жест «теряет».
 */
export async function enablePushHere(publicKey: string, retry = true): Promise<{ warning?: string }> {
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Вы не разрешили уведомления в браузере.');

  const registration = await registerPushWorker();
  if (!registration) throw new Error('Не удалось запустить службу уведомлений в этом браузере.');
  await navigator.serviceWorker.ready;

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
  const data = (await response.json().catch(() => ({}))) as { warning?: string; error?: string; code?: string };

  // Служба уведомлений не узнала подписку: браузер держит отмершую — один раз заменяем
  if (response.status === 409 && data.code === 'RESUBSCRIBE' && retry) {
    await subscription.unsubscribe();
    return enablePushHere(publicKey, false);
  }
  if (!response.ok) throw new Error(data.error ?? 'Не удалось включить уведомления.');
  return { warning: data.warning };
}
