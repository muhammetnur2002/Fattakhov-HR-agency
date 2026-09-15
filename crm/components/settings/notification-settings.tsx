"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveNotifySettingsAction,
  type NotifySettingsState,
} from "@/app/actions/notifications";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * Два уровня: каналы (почта/Telegram — включают доставку вообще)
 * и категории (какие поводы вообще должны доставляться). Раньше
 * был только первый уровень — выключить письма только про счета,
 * оставив про кандидатов, было нельзя.
 */
export function NotificationSettings({
  email,
  telegram,
  telegramChatId,
  channelsConfigured,
  categories,
  hideCategories = [],
}: {
  email: boolean;
  telegram: boolean;
  telegramChatId: string | null;
  channelsConfigured: { email: boolean; telegram: boolean };
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
  const telegramEvents = (Object.keys(EVENTS) as EventCode[]).filter((code) =>
    (EVENTS[code].channels as readonly string[]).includes("telegram"),
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
            className="mt-1 size-4"
          />
          <span>
            <span className="text-sm font-medium">Письма на почту</span>
            <span className="block text-xs text-muted-foreground">
              {emailEvents.length} типов событий: представление кандидатов,
              сроки по вакансиям, счета, напоминания о встречах
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="telegram"
            defaultChecked={telegram}
            className="mt-1 size-4"
          />
          <span>
            <span className="text-sm font-medium">Telegram</span>
            <span className="block text-xs text-muted-foreground">
              {telegramEvents.length} типов событий, включая срочные:
              решения по кандидатам, новые комментарии, напоминание за час
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="telegramChatId">Telegram: идентификатор чата</Label>
        <Input
          id="telegramChatId"
          name="telegramChatId"
          defaultValue={telegramChatId ?? ""}
          placeholder="Например, 123456789"
        />
        <p className="text-xs text-muted-foreground">
          Чтобы получать сообщения, напишите нашему боту — он подскажет ваш
          идентификатор. Пустое поле отключает Telegram. Без этого
          уведомления остаются в интерфейсе и на почте.
        </p>
      </div>

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
                className="size-4"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      {/* Честно говорим, что канал ещё не подключён на стороне сервера —
          иначе человек включит галочку и будет ждать сообщений */}
      {(!channelsConfigured.email || !channelsConfigured.telegram) && (
        <Alert>
          <AlertDescription className="text-sm">
            {!channelsConfigured.email && !channelsConfigured.telegram
              ? "Почта и Telegram ещё не подключены на сервере: уведомления пока видны только в интерфейсе."
              : !channelsConfigured.email
                ? "Почтовый сервер ещё не подключён: письма пока не отправляются."
                : "Бот ещё не подключён: сообщения в Telegram пока не отправляются."}
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
