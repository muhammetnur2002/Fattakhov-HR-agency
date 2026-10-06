import {
  VK_EVENT_OUTCOME_LABELS,
  VK_EVENT_TYPE_LABELS,
  type VkEventOutcome,
  type VkEventRow,
} from "@/lib/notifications/vk-events";
import { vkHumanError } from "@/lib/notifications/vk-api";

/**
 * Что сообщество ВКонтакте присылало на наш адрес и чем это кончилось.
 * Только для владельца: нужно, чтобы понять, на каком звене рвётся
 * привязка — а не гадать, почему «бот молчит».
 */

const TONE_CLASS = {
  ok: "text-foreground",
  warn: "text-muted-foreground",
  bad: "text-destructive",
} as const;

/** Время по Москве: агентство работает в одном часовом поясе. */
function formatMoscow(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function describe(row: VkEventRow) {
  const known = VK_EVENT_OUTCOME_LABELS[row.outcome as VkEventOutcome];
  const text = known?.text ?? row.outcome;
  // Для отказа ответить — причина словами по коду ВК (901: писать первым нельзя)
  const reason = row.outcome === "reply-failed" ? vkHumanError(row.vkErrorCode) : null;
  return { text: reason ? `${text}: ${reason}` : text, tone: known?.tone ?? "warn" };
}

export function VkEventsCard({ events }: { events: VkEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <p>От сообщества пока не пришло ни одного события.</p>
        <p className="text-muted-foreground">
          Если вы уже писали сообществу, а здесь пусто, ВКонтакте ничего не
          присылает на наш адрес. Проверьте в сообществе: Управление, Настройки,
          Работа с API, Callback API. Адрес должен быть подтверждён, а на
          вкладке «Типы событий» включено «Входящие сообщения».
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border text-sm">
      {events.map((row) => {
        const { text, tone } = describe(row);
        return (
          <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="tabular-nums text-muted-foreground">{formatMoscow(row.at)}</span>
            <span className="font-medium">{VK_EVENT_TYPE_LABELS[row.type] ?? row.type}</span>
            <span className={TONE_CLASS[tone]}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
