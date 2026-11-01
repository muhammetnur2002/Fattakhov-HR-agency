"use client";

import { ArrowLeft, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { AttachmentMenu } from "@/components/messages/attachment-menu";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import type { StudentThreadMessage } from "@/lib/students-service";
import { draftPreview, threadActivityAt, withDraft } from "@/lib/students-threads";
import type { StudentThreadItem, StudentThreadView } from "@/lib/students-threads";
import { useDraftAutosave } from "@/lib/hooks/use-draft-autosave";
import { useKeyboardViewport, useScrollToLatestOnKeyboard } from "@/lib/hooks/use-keyboard-viewport";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/utils";
import {
  loadThreadAction,
  loadThreadsAction,
  markStudentThreadReadAction,
  saveStudentDraftAction,
  sendStudentMessageAction,
} from "../actions";
import { CountBadge } from "@/components/ui/count-badge";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { PageTitle } from "@/components/ui/page-title";
import { enterSendsMessage } from "@/lib/chat-keys";
import { noScriptForm } from "@/lib/forms/no-script";
import { useStaleGuard } from "@/lib/hooks/use-stale-guard";
import { useTimeZone } from "@/components/shell/time-zone-provider";
import { formatDayDivider, formatMessageStamp, formatTime } from "@/lib/format-date";

/** Как часто сверяемся с платформой. SSE между приложениями — отдельная задача, опроса здесь достаточно. */
const POLL_MS = 10_000;

type Filter = "all" | "unread";

export function StudentMessages({
  initialThreads,
  initialThread,
}: {
  initialThreads: StudentThreadItem[];
  initialThread: StudentThreadView | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [thread, setThread] = useState<StudentThreadView | null>(initialThread);
  const [activeId, setActiveId] = useState<string | null>(initialThread?.applicationId ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, startLoading] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(rootRef);

  const refreshThreads = useCallback(async () => {
    const next = await loadThreadsAction();
    if (next) setThreads(next);
  }, []);

  const refreshThread = useCallback(async (id: string) => {
    const next = await loadThreadAction(id);
    if (next) setThread(next);
    return next;
  }, []);

  // Открыли диалог — входящее прочитано, счётчик обновляется сразу
  const open = useCallback(
    (id: string) => {
      setActiveId(id);
      window.history.replaceState(null, "", `${window.location.pathname}?thread=${id}`);
      startLoading(async () => {
        const loaded = await refreshThread(id);
        // Не открылась (сеть, чужая): на телефоне панели разделов в беседе нет, а
        // выхода из пустого экрана — только стрелка, так что вернёмся к списку сами
        if (!loaded) setActiveId(null);
        if (loaded && loaded.unread > 0) {
          await markStudentThreadReadAction(id);
          await refreshThreads();
        }
      });
    },
    [refreshThread, refreshThreads],
  );

  // Ветка, открытая по ссылке с ?thread=, тоже гасит непрочитанное
  useEffect(() => {
    if (initialThread && initialThread.unread > 0) {
      void markStudentThreadReadAction(initialThread.applicationId).then(refreshThreads);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Опрос: только пока вкладка видна — в фоне незачем гонять запросы на платформу
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshThreads();
      if (activeId) {
        const loaded = await refreshThread(activeId);
        if (loaded && loaded.unread > 0) await markStudentThreadReadAction(activeId);
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, refreshThread, refreshThreads]);

  // Беседа открыта на телефоне — страница вокруг не прокручивается (globals.css), а экран
  // беседы закреплён под шапкой кабинета; с прокрутки вниз возвращаемся к началу страницы,
  // иначе шапка осталась бы над экраном и закрепление пришлось бы под неё
  useEffect(() => {
    if (!activeId || window.innerWidth > 767) return;
    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom и подобные среды прокрутки не умеют — не страшно
    }
    document.documentElement.setAttribute("data-chat-open", "");
    return () => document.documentElement.removeAttribute("data-chat-open");
  }, [activeId]);

  // Правка черновика в открытой беседе сразу отражается в списке: не ждём опроса
  const onDraftChange = useCallback((summary: StudentThreadView, body: string) => {
    setThreads((current) => withDraft(current, summary, body, new Date().toISOString()));
  }, []);

  const unreadCount = threads.filter((t) => t.unread > 0).length;
  const needle = query.trim().toLowerCase();
  const visible = threads.filter((t) => {
    if (filter === "unread" && t.unread === 0) return false;
    if (!needle) return true;
    return t.counterpartName.toLowerCase().includes(needle) || t.vacancyTitle.toLowerCase().includes(needle);
  });

  if (threads.length === 0 && !activeId) {
    return (
      <div className="rounded-3xl border px-6 py-14 text-center">
        <h2 className="text-lg font-semibold">Переписки пока нет</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Беседа появится здесь, когда вы или студент напишете первое сообщение. Чтобы начать, откройте анкету откликнувшегося
          студента и нажмите «Написать студенту».
        </p>
        <Button asChild className="mt-5">
          <Link href="/students/applications">К откликам</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      // Открытая беседа на телефоне убирает нижнюю панель разделов (globals.css):
      // внутри беседы вкладок нет, как в мессенджерах, назад — стрелкой в шапке
      data-hides-bottom-tabs={activeId || undefined}
      className={cn(
        "flex overflow-hidden md:mx-0 md:mb-0 md:h-[calc(100svh-3.5rem-3rem-4rem)] md:min-h-[28rem] md:rounded-3xl md:border",
        activeId
          ? // Беседа — экран приложения: закреплена под шапкой кабинета до низа видимой
            // области (над полосой «Домой»), поверх вкладок раздела. Лента прокручивается
            // сама, страница вокруг — нет. С клавиатурой её держит useKeyboardViewport
            "fixed inset-x-0 bottom-0 top-14 z-40 bg-background pb-(--safe-bottom) md:static md:inset-auto md:z-auto md:bg-transparent md:pb-0"
          : // Список: без рамки и скруглений, на всю ширину; вкладки раздела остаются над ним
            "-mx-4 -mb-4 h-[calc(100svh-3.5rem-1rem-4rem)] min-h-[28rem]",
      )}
    >
      <aside aria-label="Диалоги со студентами" className={cn("flex min-h-0 w-full shrink-0 flex-col md:w-[21rem] md:border-r", activeId && "hidden md:flex")}>
        <div className="border-b p-4">
          <PageTitle compact>Сообщения студентам</PageTitle>
        </div>

        <div className="space-y-2.5 px-3 pb-3 pt-3">
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" aria-label="Поиск по диалогам" />
          <FilterChipGroup label="Какие диалоги">
            <FilterChip selected={filter === "all"} onClick={() => setFilter("all")}>
              Все
            </FilterChip>
            <FilterChip selected={filter === "unread"} onClick={() => setFilter("unread")}>
              Непрочитанные{unreadCount > 0 ? ` · ${unreadCount}` : ""}
            </FilterChip>
          </FilterChipGroup>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t p-3">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ничего не нашлось.</p>
          ) : (
            visible.map((t) => <ThreadCard key={t.applicationId} thread={t} active={t.applicationId === activeId} onClick={() => open(t.applicationId)} />)
          )}
        </div>
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !activeId && "hidden md:flex")}>
        {thread && activeId ? (
          <Conversation
            key={thread.applicationId}
            thread={thread}
            onDraftChange={onDraftChange}
            onBack={() => {
              setActiveId(null);
              setThread(null);
              window.history.replaceState(null, "", window.location.pathname);
              // Черновик мог уйти на сервер уже после опроса — сверимся ещё раз
              window.setTimeout(() => void refreshThreads(), 600);
            }}
            onSent={async () => {
              await refreshThread(thread.applicationId);
              await refreshThreads();
            }}
          />
        ) : (
          <div className="flex h-full flex-col">
            {activeId && (
              <div className="flex items-center border-b p-3.5 md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-1 shrink-0"
                  onClick={() => {
                    setActiveId(null);
                    window.history.replaceState(null, "", window.location.pathname);
                  }}
                  aria-label="К списку диалогов"
                >
                  <ArrowLeft className="size-4" />
                </Button>
              </div>
            )}
            <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
              {loading ? "Открываем…" : "Выберите диалог слева. Переписка ведётся по каждому отклику отдельно — по конкретной вакансии."}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadCard({ thread, active, onClick }: { thread: StudentThreadItem; active: boolean; onClick: () => void }) {
  const timeZone = useTimeZone();
  // Время в списке — последняя активность: сообщение или правка черновика
  const activityAt = threadActivityAt(thread);
  const draft = thread.draft;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left shadow-xs transition-colors hover:bg-muted/60",
        active ? "bg-muted" : "bg-card",
      )}
    >
      {thread.unread > 0 && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      <Avatar className="shrink-0">
        <ThreadPhoto thread={thread} />
        <AvatarFallback>{thread.counterpartName.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-medium">{thread.counterpartName}</div>
          {activityAt > 0 && (
            // Время — в зоне из профиля, одной на сервере и в браузере (lib/format-date.ts)
            <div className="shrink-0 text-xs text-muted-foreground">
              {formatMessageStamp(activityAt, new Date(), timeZone)}
            </div>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{thread.vacancyTitle}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {draft ? (
            // Черновик — серым курсивом вместо последнего сообщения; студент его не видит
            <div className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground" data-draft>
              Черновик: {draftPreview(draft)}
            </div>
          ) : (
            <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {thread.lastMessageAuthor === "EMPLOYER" && <span className="text-foreground">Вы: </span>}
              {thread.lastMessageBody ?? "Переписки ещё не было"}
            </div>
          )}
          {thread.unread > 0 && <CountBadge count={thread.unread} label="непрочитанных" />}
        </div>
      </div>
    </button>
  );
}

function Conversation({
  thread,
  onBack,
  onSent,
  onDraftChange,
}: {
  thread: StudentThreadView;
  onBack: () => void;
  onSent: () => Promise<void>;
  onDraftChange: (thread: StudentThreadView, body: string) => void;
}) {
  const timeZone = useTimeZone();
  const now = new Date();
  const dayLabel = (value: string) => formatDayDivider(value, now, timeZone);
  const timeOnly = (value: string) => formatTime(value, timeZone);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToLatestOnKeyboard(scroller);
  const stick = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Черновик сохраняется сам: после паузы в наборе, при сворачивании и уходе с экрана
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  });
  const { draft, setDraft, flush, settle, clear } = useDraftAutosave({
    initial: thread.draft,
    save: async (text) => {
      onDraftChange(threadRef.current, text);
      return saveStudentDraftAction(thread.applicationId, text);
    },
  });

  // Прокрутка уезжает вниз на новое сообщение, только если человек и так был внизу
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [thread.messages.length]);

  // Идёт отправка. Ссылка, а не только состояние pending: два Enter подряд приходят
  // раньше, чем React перерисует компонент, и по состоянию второй ещё видел бы «не занято»
  const sending = useRef(false);
  const guardStale = useStaleGuard();

  async function send() {
    const body = draft.trim();
    if (!body || pending || sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      // Запись черновика, что ещё в пути, должна завершиться до отправки: иначе она
      // дописалась бы после удаления и вернула черновик уже отправленного сообщения
      await settle();
      const result = await sendStudentMessageAction(thread.applicationId, body);
      if (result.error) {
        setError(result.error);
        void flush();
        return;
      }
      // Черновик на сервере удалён самим действием отправки
      clear();
      stick.current = true;
    } catch (error) {
      if (guardStale(error)) return;
      // Нет связи: действие бросает, а не возвращает отказ. Без перехвата pending
      // оставался true навсегда, и кнопка «Отправить» больше не оживала. Текст остаётся
      setError("Не отправилось: нет связи с сервером. Попробуйте ещё раз");
      void flush();
      return;
    } finally {
      sending.current = false;
      setPending(false);
    }
    await onSent();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b p-3.5">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1 shrink-0 md:hidden"
          onClick={() => void flush().then(onBack)}
          aria-label="К списку диалогов"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar>
          <ThreadPhoto thread={thread} />
          <AvatarFallback>{thread.counterpartName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{thread.counterpartName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {thread.vacancyTitle} · {thread.counterpartSubtitle}
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
      >
        {thread.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Сообщений пока нет. Напишите первым.</p>
        ) : (
          thread.messages.map((m, i) => {
            const previous = thread.messages[i - 1];
            const next = thread.messages[i + 1];
            const grouped = Boolean(previous) && sameBurst(previous, m);
            const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);
            const lastInBurst = !next || !sameBurst(m, next);
            return (
              <div key={m.id}>
                {showDay && <p className="my-3 text-center text-xs text-muted-foreground first:mt-0">{dayLabel(m.createdAt)}</p>}
                <div className={cn("flex", m.mine ? "justify-end" : "justify-start", grouped && !showDay ? "mt-0.5" : "mt-2")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                      m.mine
                        ? cn("bg-primary text-primary-foreground", lastInBurst && "rounded-br-md")
                        : cn("bg-muted text-foreground", lastInBurst && "rounded-bl-md"),
                    )}
                  >
                    <div className="whitespace-pre-line break-words">{m.body}</div>
                    {lastInBurst && (
                      <div className={cn("mt-1 text-right text-xs", m.mine ? "text-primary-foreground" : "text-muted-foreground")}>
                        {timeOnly(m.createdAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {thread.canWrite ? (
        <form
          ref={formRef}
          {...noScriptForm}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="shrink-0 border-t p-3"
        >
          <div className="flex items-end gap-2">
            <AttachmentMenu />
            <AutoGrowTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder="Сообщение"
              aria-label="Текст сообщения"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl px-4 py-2.5"
              // Подсказка клавиатуре: на телефоне Enter переносит строку, а не отправляет
              enterKeyHint="enter"
              onKeyDown={(e) => {
                // На компьютере Enter отправляет, Shift+Enter — перенос; на телефоне — всегда перенос
                if (enterSendsMessage(e)) {
                  e.preventDefault();
                  if (!sending.current) formRef.current?.requestSubmit();
                }
              }}
            />
            <SubmitButton
              size="icon"
              className="size-11 shrink-0 rounded-full"
              loading={pending}
              disabled={!draft.trim()}
              aria-label="Отправить"
              // Пока идёт отправка, на месте стрелки — индикатор
              pendingLabel={<span className="sr-only">Отправляем…</span>}
            >
              <ArrowUp className="size-5" />
            </SubmitButton>
          </div>
          <FormMessage error={error} className="mt-2 py-2" />
        </form>
      ) : (
        <p className="shrink-0 border-t p-4 text-center text-sm text-muted-foreground">{thread.lockedReason ?? "Переписка недоступна"}</p>
      )}
    </div>
  );
}

function sameBurst(a: StudentThreadMessage, b: StudentThreadMessage): boolean {
  if (a.mine !== b.mine) return false;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) < 5 * 60_000;
}

/** Фото студента в кружке: файл берётся по отклику своей компании, у кого фото нет — остаётся инициал. */
function ThreadPhoto({ thread }: { thread: { applicationId: string; counterpartPhotoUrl?: string | null } }) {
  if (!thread.counterpartPhotoUrl) return null;
  return (
    <AvatarImage
      src={`/api/students-applicant-file?applicationId=${encodeURIComponent(thread.applicationId)}&kind=photo`}
      alt=""
    />
  );
}
