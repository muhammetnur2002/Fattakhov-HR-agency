import { PushPrompt } from "@/components/shell/push-prompt";
import { prisma } from "@/lib/db/prisma";
import { listPushDevices } from "@/lib/notifications/push";
import { pushPublicKey } from "@/lib/notifications/push-config";

/**
 * Плашка «Разрешите уведомления» для макетов кабинетов: решает на сервере,
 * нужна ли она вообще. Нет канала на сервере или человек снял галочку
 * «Уведомления на телефон и компьютер» — предлагать нечего.
 */
export async function PushPromptGate({ userId }: { userId: string }) {
  // Ключ — на запрос, не при сборке (см. lib/notifications/push-config.ts)
  const publicKey = pushPublicKey();
  if (!publicKey) return null;

  const [user, devices] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId }, select: { notifyPrefs: true } }),
    listPushDevices(userId),
  ]);
  const prefs =
    typeof user?.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};
  if (prefs.push === false) return null;

  return (
    <PushPrompt
      userId={userId}
      publicKey={publicKey}
      devices={devices.map((device) => device.endpointHash)}
    />
  );
}
