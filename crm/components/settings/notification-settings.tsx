"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveNotifySettingsAction,
  type NotifySettingsState,
} from "@/app/actions/notifications";
import { PushDevice, type PushDeviceRef } from "@/components/settings/push-device";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VkLinkBlock } from "./vk-link-block";
import {
  CATEGORY_LABELS,
  categoriesInUse,
  EVENTS,
  type EventCategory,
  type EventCode,
} from "@/lib/notifications/events";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить"}
    </Button>
  );
}

/**
 * Настройки уведомлений.
 *
 * Два уровня: каналы (почта/ВК — включают доставку вообще)
 * и категории (какие поводы вообще должны доставляться). Раньше
 * был только первый уровень — выключить письма только про счета,
 * оставив про кандидатов, было нельзя.
 */
export function NotificationSettings({
  email,
  vk = true,
  vkUserId = null,
  vkMessageUrl = null,
  push = true,
  pushPublicKey = null,
  pushDevices = [],
  channelsConfigured,
  categories,
  hideCategories = [],
}: {
  email: boolean;
  /** Включён ли ВК у человека; по умолчанию — да, если привязан. */
  vk?: boolean;
  vkUserId?: string | null;
  /** Адрес сообщества агентства — там разрешают ему сообщения. */
  vkMessageUrl?: string | null;
  /** Галочка пуша: false — человек выключил уведомления на всех устройствах. */
  push?: boolean;
  /**
   * Открытый ключ VAPID — есть, только когда пуш настроен на сервере.
   * Приходит пропсом из серверной страницы, а не из NEXT_PUBLIC_*:
   * те вшиваются при сборке образа, где боевых настроек нет.
   */
  pushPublicKey?: string | null;
  /** Устройства человека с уведомлениями — отпечатками, без адресов. */
  pushDevices?: PushDeviceRef[];
  channelsConfigured: { email: boolean; vk?: boolean };
  categories: Record<string, boolean>;
  /** Категории, не относящиеся к этой стороне (например, «Заявки с сайта» у клиента). */
  hideCategories?: EventCategory[];
}) {
  const [state, formAction] = useActionState<NotifySettingsState, FormData>(
    saveNotifySettingsAction,
    {},
  );

  const emailEvents = (Object.keys(EVENTS) as EventCode[]).filter((code) =>
    (EVENTS[code].channels as readonly string[]).includes("email"),
  );
  const vkEvents = (Object.keys(EVENTS) as EventCode[]).filter((code) =>
    (EVENTS[code].channels as readonly string[]).includes("vk"),
  );

  const visibleCategories = categoriesInUse().filter(
    (cat) => !hideCategories.includes(cat),
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="email"
            defaultChecked={email}
            className="mt-1 size-4 shrink-0"
          />
          <span>
            <span className="text-sm font-medium">Письма на почту</span>
            <span className="block text-xs text-muted-foreground">
              Все {emailEvents.length} типов событий: кандидаты и решения,
              вакансии и сроки, обсуждения, встречи, счета, сводки
            </span>
          </span>
        </label>
      </div>

      {/*
        ВК показывается только когда он подключён на сервере. Галочка
        канала, который не может ничего отправить, — ровно то, из-за чего
        разбираются полдня: человек видит «включено» и ждёт.
      */}
      {channelsConfigured.vk && (
        <div className="space-y-3 border-t pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="vk"
              defaultChecked={vk}
              className="mt-1 size-4 shrink-0"
            />
            <span>
              <span className="text-sm font-medium">ВКонтакте</span>
              <span className="block text-xs text-muted-foreground">
                {vkEvents.length} типов событий — срочное: решения по
                кандидатам, новые комментарии, напоминание за час до встречи.
                Сообщением от сообщества агентства
              </span>
            </span>
          </label>

          <input type="hidden" name="vkInForm" value="1" />
          <VkLinkBlock vkUserId={vkUserId} messageUrl={vkMessageUrl} />
        </div>
      )}

      {/*
        Пуш — тоже только при настроенном канале (VAPID на сервере). Галочка
        — общая на все устройства; само включение — на каждом устройстве
        отдельно, кнопкой ниже: подписка живёт в браузере. Скрытое поле
        говорит действию, что галочка была в форме: снятая в форму
        не попадает, и без него «выключено» не отличить от «не было».
      */}
      {pushPublicKey && (
        <div className="space-y-3 border-t pt-4">
          <input type="hidden" name="pushInForm" value="1" />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="push"
              defaultChecked={push}
              className="mt-1 size-4 shrink-0"
            />
            <span>
              <span className="text-sm font-medium">
                Уведомления на телефон и компьютер
              </span>
              <span className="block text-xs text-muted-foreground">
                Все события кабинета — кандидаты и решения, комментарии и
                сообщения, встречи, счета — уведомлением на экран тех
                устройств, где вы их включили. Только что случилось и ссылка
                в кабинет: без имён, компаний и сумм.
              </span>
            </span>
          </label>

          <PushDevice
            publicKey={pushPublicKey}
            devices={pushDevices}
            paused={!push}
          />
        </div>
      )}

      {/* Второй уровень фильтра: канал включён, но конкретный повод —
          нет. По умолчанию включено всё: ключа нет — значит true */}
      <div className="space-y-2 border-t pt-4">
        <Label>О чём присылать</Label>
        <p className="text-xs text-muted-foreground">
          Действует поверх каналов выше — если письма выключены совсем,
          эти галочки ничего не изменят.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleCategories.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`cat_${cat}`}
                defaultChecked={categories[cat] !== false}
                className="size-4 shrink-0"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      {/* Честно говорим, что канал ещё не подключён на стороне сервера —
          иначе человек включит галочку и будет ждать сообщений */}
      {!channelsConfigured.email && (
        <Alert>
          <AlertDescription className="text-sm">
            {channelsConfigured.vk
              ? "Почтовый сервер ещё не подключён: письма пока не отправляются."
              : "Почта и ВКонтакте ещё не подключены на сервере: уведомления пока видны только в интерфейсе."}
          </AlertDescription>
        </Alert>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}

      <Submit />
    </form>
  );
}
