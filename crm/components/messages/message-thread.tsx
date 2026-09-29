"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  markConversationReadAction,
  sendMessageAction,
  type MessageState,
} from "@/app/actions/messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useScrollToLatestOnKeyboard } from "@/lib/hooks/use-keyboard-viewport";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  fromMe: boolean;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="icon"
      className="size-11 shrink-0 rounded-full"
      disabled={pending}
      aria-label={pending ? "Отправляем…" : "Отправить"}
    >
      <ArrowUp className="size-5" />
    </Button>
  );
}

/**
 * Переписка с одним человеком.
 *
 * Свои сообщения справа, чужие слева — привычная раскладка любого
 * мессенджера, и объяснять её не нужно. Порядок снизу вверх по времени:
 * последнее внизу, у поля ввода.
 */
export function MessageThread({
  messages,
  recipientId,
  hasUnread,
}: {
  messages: ThreadMessage[];
  recipientId: string;
  /** Есть ли непрочитанное входящее — чтобы не дёргать сервер зря. */
  hasUnread: boolean;
}) {
  const [state, setState] = useState<MessageState>({});
  const formRef = useRef<HTMLFormElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToLatestOnKeyboard(scroller);

  /*
    Обычный обработчик вместо useActionState: после отправки надо
    очистить поле, а делать это эффектом на смену состояния — лишний
    каскад перерисовок. Тот же приём, что в обсуждениях.
  */
  async function handleSubmit(formData: FormData) {
    const result = await sendMessageAction({}, formData);
    setState(result);
    if (result.ok) formRef.current?.reset();
  }

  // Открыли переписку — входящее прочитано. Ответа не ждём: это
  // фоновая отметка, а не действие человека
  useEffect(() => {
    if (hasUnread) void markConversationReadAction(recipientId);
  }, [hasUnread, recipientId]);

  // Панель фиксированной высоты — без этого новое сообщение уезжало бы
  // за нижний край, не сдвигая видимую часть ленты
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Переписки пока нет. Напишите первым.
        </p>
      ) : (
        <div>
          {messages.map((m, i) => {
            const previous = messages[i - 1];
            const next = messages[i + 1];
            const grouped = Boolean(previous) && isSameBurst(previous, m);
            const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);
            const lastInBurst = !next || !isSameBurst(m, next);
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="my-3 text-center text-xs text-muted-foreground first:mt-0">
                    {dayLabel(m.createdAt)}
                  </p>
                )}
                <div
                  className={cn(
                    "flex",
                    m.fromMe ? "justify-end" : "justify-start",
                    grouped && !showDay ? "mt-0.5" : "mt-2",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                      m.fromMe
                        ? cn("bg-primary text-primary-foreground", lastInBurst && "rounded-br-md")
                        : cn("bg-muted text-foreground", lastInBurst && "rounded-bl-md"),
                    )}
                  >
                    <div className="whitespace-pre-line break-words">{m.body}</div>
                    {lastInBurst && (
                      <div
                        className={cn(
                          "mt-1 text-right text-xs",
                          m.fromMe ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {timeOnly(m.createdAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <form ref={formRef} action={handleSubmit} className="shrink-0 border-t p-3">
        <input type="hidden" name="recipientId" value={recipientId} />
        <div className="flex items-end gap-2">
          <Textarea
            name="body"
            rows={1}
            required
            maxLength={5000}
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
          <Submit />
        </div>
        {state.error && (
          <Alert variant="destructive" className="mt-2 py-2">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}

/** Сегодня / Вчера / короткая дата — разделитель дня в ленте сообщений. */
function dayLabel(date: Date): string {
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

/** Один ли это «залп» сообщений: тот же автор и меньше пяти минут разрыва. */
function isSameBurst(previous: ThreadMessage, current: ThreadMessage): boolean {
  if (previous.fromMe !== current.fromMe) return false;
  return current.createdAt.getTime() - previous.createdAt.getTime() < 5 * 60_000;
}

function timeOnly(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}
