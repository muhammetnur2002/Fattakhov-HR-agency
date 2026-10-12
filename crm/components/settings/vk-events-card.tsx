import {
  VK_EVENT_OUTCOME_LABELS,
  VK_EVENT_TYPE_LABELS,
  type VkEventOutcome,
  type VkEventRow,
} from "@/lib/notifications/vk-events";
import { vkHumanError } from "@/lib/notifications/vk-api";
import { formatInZone } from "@/lib/format-date";

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

function describe(row: VkEventRow) {
  const known = VK_EVENT_OUTCOME_LABELS[row.outcome as VkEventOutcome];
  const text = known?.text ?? row.outcome;
  // Для отказа ответить — причина словами по коду ВК (901: писать первым нельзя)
  const reason = row.outcome === "reply-failed" ? vkHumanError(row.vkErrorCode) : null;
  return { text: reason ? `${text}: ${reason}` : text, tone: known?.tone ?? "warn" };
}

export function VkEventsCard({ events, timeZone }: { events: VkEventRow[]; timeZone: string }) {
  if (events.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <p>Пока ни одного события: бот ещё не запускался или никто не писал сообществу.</p>
        <p className="text-muted-foreground">
          Бот сам проверяет сообщения сообщества каждые 5 секунд, настраивать
          Callback API в ВКонтакте не нужно. Строка «бот запущен» появляется,
          когда запустился фоновый процесс платформы. Если её нет через
          минуту после выкатки или написали сообществу, а здесь пусто, значит
          сообщения не доходят до сообщества: проверьте, что человек пишет
          именно в личные сообщения сообщества «Fattakhov HR».
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
            <span className="tabular-nums text-muted-foreground">{formatInZone(row.at, "dateTimeSeconds", timeZone)}</span>
            <span className="font-medium">{VK_EVENT_TYPE_LABELS[row.type] ?? row.type}</span>
            <span className={TONE_CLASS[tone]}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
