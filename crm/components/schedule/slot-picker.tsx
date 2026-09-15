"use client";

import { Check, Clock } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmSlotAction,
  requestOtherSlotsAction,
  type ScheduleState,
} from "@/app/(public)/schedule/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isSlotPast } from "@/lib/services/interview-status";
import { cn } from "@/lib/utils";

export type PublicSlot = {
  id: string;
  /** ISO-строка: Date через границу сервер-клиент не проходит. */
  startsAt: string;
  endsAt: string;
};

/** Частые российские зоны. Кандидат может быть не там, где компания. */
const TIMEZONES = [
  { value: "Europe/Kaliningrad", label: "Калининград (MSK−1)" },
  { value: "Europe/Moscow", label: "Москва (MSK)" },
  { value: "Europe/Samara", label: "Самара (MSK+1)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (MSK+2)" },
  { value: "Asia/Omsk", label: "Омск (MSK+3)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (MSK+4)" },
  { value: "Asia/Irkutsk", label: "Иркутск (MSK+5)" },
  { value: "Asia/Yakutsk", label: "Якутск (MSK+6)" },
  { value: "Asia/Vladivostok", label: "Владивосток (MSK+7)" },
  { value: "Asia/Magadan", label: "Магадан (MSK+8)" },
  { value: "Asia/Kamchatka", label: "Камчатка (MSK+9)" },
];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Сохраняем…" : label}
    </Button>
  );
}

/**
 * Выбор времени кандидатом.
 *
 * Экран открывается на телефоне, без аккаунта и, скорее всего, между
 * делом. Поэтому: крупные кнопки, время сразу в его часовом поясе,
 * и всё в два касания. Каждый лишний шаг здесь — это день переписки.
 */
export function SlotPicker({
  token,
  slots,
  durationMinutes,
  now,
}: {
  token: string;
  slots: PublicSlot[];
  durationMinutes: number;
  /**
   * Момент отрисовки в миллисекундах, приходит со страницы.
   *
   * Свой вызов часов здесь означал бы разные значения у серверной
   * разметки и у гидратации — тот же приём, что в CalendarView
   * и на доске кандидатов.
   */
  now: number;
}) {
  // Часовой пояс браузера — почти всегда правильный ответ, но менять
  // его должно быть можно: кандидат может отвечать из поездки
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [askingOther, setAskingOther] = useState(false);
  const [state, setState] = useState<ScheduleState>({});

  async function handleConfirm(formData: FormData) {
    setState(await confirmSlotAction({}, formData));
  }

  async function handleAsk(formData: FormData) {
    setState(await requestOtherSlotsAction({}, formData));
  }

  if (state.confirmed) {
    // Берём время из ответа сервера: подтверждение должно показывать
    // записанное, а не нажатое
    const confirmedAt =
      state.scheduledAt ?? slots.find((s) => s.id === selected)?.startsAt;
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Встреча назначена</h2>
          {confirmedAt && (
            <p className="mt-1 text-sm font-medium">
              {formatDay(confirmedAt, timezone)},{" "}
              {formatTime(confirmedAt, timezone)}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Мы отправим напоминание накануне и за час до встречи.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <a href={`/api/calendar/interview.ics?token=${token}`}>
            Добавить в календарь
          </a>
        </Button>
      </div>
    );
  }

  if (state.asked) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-medium">Спасибо, передали рекрутеру</h2>
        <p className="text-sm text-muted-foreground">
          Он подберёт другое время и пришлёт новую ссылку.
        </p>
      </div>
    );
  }

  /*
    Прошедшее время — не вариант выбора.

    Ссылка живёт в почте несколько дней, и часть предложенных слотов
    к моменту открытия успевает пройти. Раньше они всё равно
    показывались обычными кнопками: кандидат выбирал, жал
    «Подтвердить» и получал отказ «это время уже прошло» — сервер
    проверку делал, а экран о ней не знал. Если за выходные проходили
    все варианты, отказ приходил на каждый, и человеку оставалось
    догадываться.

    Показываем их, а не прячем: исчезнувшие строки читались бы как
    поломка письма, а перечёркнутое время объясняет, что случилось.
  */
  const isPast = (slot: PublicSlot) =>
    isSlotPast(new Date(slot.startsAt), new Date(now));
  const upcoming = slots.filter((slot) => !isPast(slot));
  const nothingLeft = upcoming.length === 0;

  const byDay = groupByDay(slots, timezone);

  return (
    <div className="space-y-6">
      {nothingLeft && !askingOther && (
        <div className="space-y-4">
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-medium">Эти варианты уже прошли</h2>
            <p className="text-sm text-muted-foreground">
              Так бывает, если письмо полежало. Напишите, когда вам удобно, —
              рекрутер пришлёт новые варианты.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => setAskingOther(true)}
          >
            Предложить своё время
          </Button>
        </div>
      )}

      {!askingOther && !nothingLeft && (
        <>
          <form action={handleConfirm} className="space-y-5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="slotId" value={selected ?? ""} />

            <div className="space-y-4">
              {byDay.map(([day, daySlots]) => (
                <div key={day} className="space-y-2">
                  <div className="text-sm font-medium">{day}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {daySlots.map((slot) => {
                      const past = isPast(slot);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={past}
                          onClick={() => setSelected(slot.id)}
                          className={cn(
                            // Крупная зона нажатия: экран открывают с телефона
                            "flex min-h-14 items-center justify-center gap-2 rounded-lg border px-4 text-base transition-colors",
                            past
                              ? "cursor-not-allowed border-dashed text-muted-foreground"
                              : selected === slot.id
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:border-primary/40",
                          )}
                        >
                          <Clock className="size-4" />
                          <span className={cn(past && "line-through")}>
                            {formatTime(slot.startsAt, timezone)}
                          </span>
                          {past && <span className="text-xs">прошло</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Ваш часовой пояс</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                {/* Высота крупнее обычной: экран открывают с телефона,
                    и здесь всё рассчитано на палец. Приоритет нужен —
                    свою высоту SelectTrigger задаёт через data-[size] */}
                <SelectTrigger id="timezone" className="h-11! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!TIMEZONES.some((t) => t.value === timezone) && (
                    <SelectItem value={timezone}>{timezone}</SelectItem>
                  )}
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Время показано в этом поясе. Встреча длится{" "}
                {durationMinutes} минут.
              </p>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <SubmitButton label="Подтвердить время" />
          </form>

          <button
            type="button"
            onClick={() => setAskingOther(true)}
            className="w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Ни один вариант не подходит
          </button>
        </>
      )}

      {askingOther && (
        <form action={handleAsk} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="note">Когда вам удобно?</Label>
            <Textarea
              id="note"
              name="note"
              rows={3}
              required
              placeholder="Например: в будни после 18:00 или в субботу днём"
            />
          </div>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <SubmitButton label="Отправить рекрутеру" />
          <button
            type="button"
            onClick={() => setAskingOther(false)}
            className="w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Вернуться к вариантам
          </button>
        </form>
      )}
    </div>
  );
}

function groupByDay(
  slots: PublicSlot[],
  timezone: string,
): [string, PublicSlot[]][] {
  const map = new Map<string, PublicSlot[]>();
  for (const slot of slots) {
    const day = formatDay(slot.startsAt, timezone);
    map.set(day, [...(map.get(day) ?? []), slot]);
  }
  return [...map.entries()];
}

function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(iso));
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
