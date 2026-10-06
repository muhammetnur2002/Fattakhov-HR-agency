import type { StudentThread, StudentThreadSummary } from "@/lib/students-service";

/**
 * Список «Сообщения» кабинета клиента: какие беседы показывать и в каком порядке.
 *
 * Платформа отдаёт беседу по каждому отклику — так задумано: студент видит
 * её со своей стороны, а работодатель по прямой ссылке («Написать студенту»
 * в анкете отклика) может открыть любую. Но в списке работодателя беседа
 * без единого сообщения — шум: студент появлялся там, как только откликнулся
 * и анкету просто открыли. Поэтому здесь беседа показывается, только если
 * в ней есть сообщение (от любой стороны) или у этого пользователя CRM
 * есть непустой черновик. Чистая логика — без обращений к базе и платформе,
 * чтобы её проверяли обычным тестом.
 */

/** Черновик сообщения студенту — запись CRM на пару «пользователь — отклик». */
export interface StudentDraft {
  applicationId: string;
  body: string;
  updatedAt: string;
}

/** Строка списка: беседа платформы плюс черновик этого пользователя (если есть). */
export interface StudentThreadItem extends StudentThreadSummary {
  /** Текст черновика; null — нет или пустой. */
  draft: string | null;
  /** Когда черновик обновлён — для порядка в списке. */
  draftAt: string | null;
}

/** Открытая беседа с черновиком этого пользователя в поле ввода. */
export interface StudentThreadView extends StudentThread {
  draft: string;
}

/** Предпросмотр черновика в одну строку — тот же предел, что у последнего сообщения на платформе. */
export function draftPreview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat;
}

function time(value: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Последняя активность беседы: позднее из «последнее сообщение» и «черновик обновлён». */
export function threadActivityAt(item: Pick<StudentThreadItem, "lastMessageAt" | "draftAt">): number {
  return Math.max(time(item.lastMessageAt), time(item.draftAt));
}

/**
 * Беседы платформы + черновики → видимый список, свежие сверху.
 * Черновик, у которого нет беседы в ответе платформы (чужой или удалённый
 * отклик), в список не попадает — берём только то, что платформа отдала
 * этому клиенту. Непрочитанное считается по сообщениям: черновик его не
 * создаёт (поле unread платформы не трогаем).
 */
export function buildThreadList(threads: StudentThreadSummary[], drafts: StudentDraft[]): StudentThreadItem[] {
  const byApplication = new Map<string, StudentDraft>();
  for (const draft of drafts) {
    if (draft.body.trim() !== "") byApplication.set(draft.applicationId, draft);
  }

  const items: StudentThreadItem[] = [];
  for (const thread of threads) {
    const draft = byApplication.get(thread.applicationId) ?? null;
    const hasMessages = thread.lastMessageAt !== null || thread.lastMessageBody !== null;
    if (!hasMessages && !draft) continue;
    items.push({ ...thread, draft: draft?.body ?? null, draftAt: draft?.updatedAt ?? null });
  }
  return items.sort((a, b) => threadActivityAt(b) - threadActivityAt(a));
}

/**
 * Список после правки черновика на этой же странице — не дожидаясь ответа
 * сервера: человек набрал текст и вышел к списку, беседа должна быть там сразу.
 * Пустой текст снимает черновик, и беседа без сообщений из списка уходит.
 * `thread` — беседа, у которой правят черновик (полная сводка платформы).
 */
export function withDraft(
  items: StudentThreadItem[],
  thread: StudentThreadSummary,
  body: string,
  now: string,
): StudentThreadItem[] {
  const existing = items.find((t) => t.applicationId === thread.applicationId);
  const draft = body.trim() === "" ? null : body;
  const hasMessages = thread.lastMessageAt !== null || thread.lastMessageBody !== null;
  const rest = items.filter((t) => t.applicationId !== thread.applicationId);
  if (!draft && !hasMessages) return rest;
  // Из полной беседы в список переходит только сводка: сообщения там ни к чему
  const base: StudentThreadSummary & { messages?: unknown } = { ...(existing ?? thread) };
  delete base.messages;
  const next: StudentThreadItem = { ...base, draft, draftAt: draft ? now : null };
  return [...rest, next].sort((a, b) => threadActivityAt(b) - threadActivityAt(a));
}
