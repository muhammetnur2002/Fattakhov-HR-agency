"use client";

import { ArrowLeft, ArrowUp, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StudentThread, StudentThreadMessage, StudentThreadSummary } from "@/lib/students-service";
import { useKeyboardViewport, useScrollToLatestOnKeyboard } from "@/lib/hooks/use-keyboard-viewport";
import { cn } from "@/lib/utils";
import {
  loadThreadAction,
  loadThreadsAction,
  markStudentThreadReadAction,
  sendStudentMessageAction,
} from "../actions";

/** Как часто сверяемся с платформой. SSE между приложениями — отдельная задача, опроса здесь достаточно. */
const POLL_MS = 10_000;

type Filter = "all" | "unread";

export function StudentMessages({
  initialThreads,
  initialThread,
}: {
  initialThreads: StudentThreadSummary[];
  initialThread: StudentThread | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [thread, setThread] = useState<StudentThread | null>(initialThread);
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

  const unreadCount = threads.filter((t) => t.unread > 0).length;
  const needle = query.trim().toLowerCase();
  const visible = threads.filter((t) => {
    if (filter === "unread" && t.unread === 0) return false;
    if (!needle) return true;
    return t.counterpartName.toLowerCase().includes(needle) || t.vacancyTitle.toLowerCase().includes(needle);
  });

  if (threads.length === 0) {
    return (
      <div className="rounded-3xl border px-6 py-14 text-center">
        <h2 className="text-lg font-semibold">Переписки пока нет</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Диалоги появятся вместе с откликами: как только студент откликнется на вашу вакансию, ему можно будет написать.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      // На телефоне — без рамки и скруглений, на всю ширину; вкладки раздела остаются над чатом
      className="-mx-4 -mb-4 flex h-[calc(100svh-3.5rem-1rem-4rem)] min-h-[28rem] overflow-hidden md:mx-0 md:mb-0 md:h-[calc(100svh-3.5rem-3rem-4rem)] md:rounded-3xl md:border"
    >
      <aside className={cn("flex min-h-0 w-full shrink-0 flex-col md:w-[21rem] md:border-r", activeId && "hidden md:flex")}>
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">Сообщения студентам</h1>
        </div>

        <div className="space-y-2.5 px-3 pb-3 pt-3">
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-muted/40 px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              aria-label="Поиск по диалогам"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              Все
            </FilterChip>
            <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
              Непрочитанные{unreadCount > 0 ? ` · ${unreadCount}` : ""}
            </FilterChip>
          </div>
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
            onBack={() => {
              setActiveId(null);
              setThread(null);
              window.history.replaceState(null, "", window.location.pathname);
            }}
            onSent={async () => {
              await refreshThread(thread.applicationId);
              await refreshThreads();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
            {loading ? "Открываем…" : "Выберите диалог слева. Переписка ведётся по каждому отклику отдельно — по конкретной вакансии."}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ThreadCard({ thread, active, onClick }: { thread: StudentThreadSummary; active: boolean; onClick: () => void }) {
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
          <div className="truncate text-[13.5px] font-medium">{thread.counterpartName}</div>
          {thread.lastMessageAt && (
            <div className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(thread.lastMessageAt)}</div>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{thread.vacancyTitle}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {thread.lastMessageAuthor === "EMPLOYER" && <span className="text-foreground">Вы: </span>}
            {thread.lastMessageBody ?? "Переписки ещё не было"}
          </div>
          {thread.unread > 0 && (
            <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {thread.unread > 9 ? "9+" : thread.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Conversation({ thread, onBack, onSent }: { thread: StudentThread; onBack: () => void; onSent: () => Promise<void> }) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToLatestOnKeyboard(scroller);
  const stick = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");

  // Прокрутка уезжает вниз на новое сообщение, только если человек и так был внизу
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [thread.messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    const result = await sendStudentMessageAction(thread.applicationId, body);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    stick.current = true;
    await onSent();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-3.5">
        <Button variant="ghost" size="icon" className="-ml-1 shrink-0 md:hidden" onClick={onBack} aria-label="К списку диалогов">
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
        className="min-h-0 flex-1 overflow-y-auto p-4"
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
                      <div className={cn("mt-1 text-right text-xs", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
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
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="shrink-0 border-t p-3"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder="Сообщение"
              aria-label="Текст сообщения"
              className="min-h-11 flex-1 resize-none rounded-3xl px-4 py-2.5"
              onKeyDown={(e) => {
                // Enter отправляет, Shift+Enter — перенос строки
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
            />
            <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={pending || !draft.trim()} aria-label="Отправить">
              <ArrowUp className="size-5" />
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-2 py-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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

function dayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function timeOnly(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatWhen(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? timeOnly(value) : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
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
