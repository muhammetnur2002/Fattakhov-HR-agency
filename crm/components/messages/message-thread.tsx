"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import {
  markConversationReadAction,
  sendMessageAction,
  type MessageState,
} from "@/app/actions/messages";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { AttachmentMenu } from "@/components/messages/attachment-menu";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { useScrollToLatestOnKeyboard } from "@/lib/hooks/use-keyboard-viewport";
import { cn } from "@/lib/utils";
import { enterSendsMessage } from "@/lib/chat-keys";
import { useStaleGuard } from "@/lib/hooks/use-stale-guard";
import { formatDayDivider, formatTime } from "@/lib/format-date";
import { useTimeZone } from "@/components/shell/time-zone-provider";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  fromMe: boolean;
};

function Submit() {
  return (
    <SubmitButton
      size="icon"
      className="size-11 shrink-0 rounded-full"
      // Имя кнопки не меняется: ход отправки объявляет живая область самого SubmitButton
      aria-label="Отправить"
      // Пока идёт отправка, на месте стрелки — индикатор
      pendingLabel={<span className="sr-only">Отправляем…</span>}
    >
      <ArrowUp className="size-5" />
    </SubmitButton>
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
  const timeZone = useTimeZone();
  const [state, setState] = useState<MessageState>({});
  const now = new Date();
  /** Сегодня / Вчера / короткая дата — разделитель дня в ленте сообщений. */
  const dayLabel = (date: Date) => formatDayDivider(date, now, timeZone);
  const timeOnly = (date: Date) => formatTime(date, timeZone);
  // Текст в состоянии, а не в самом поле: React 19 после любой отправки формы
  // через action очищает обычные поля, в том числе когда отправка не удалась,
  // а у управляемого поля прежний текст возвращается. Иначе сообщение, не
  // дошедшее до сервера, пропадало бы вместе с отказом
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Идёт отправка. Ссылка, а не состояние: Enter приходит быстрее, чем
  // React успевает перерисовать кнопку, и по состоянию второй Enter ещё видел бы «не занято»
  const sending = useRef(false);
  const guardStale = useStaleGuard();
  useScrollToLatestOnKeyboard(scroller);

  /*
    Обычный обработчик вместо useActionState: после отправки надо
    очистить поле, а делать это эффектом на смену состояния — лишний
    каскад перерисовок. Тот же приём, что в обсуждениях.

    Пока идёт предыдущая отправка, новая не стартует. Выключенной кнопки для
    этого мало: Enter в поле вызывает requestSubmit() в обход кнопки, и
    сообщение уходило дважды (проверка 11.10.2026). Сервер дополнительно
    не создаёт второе одинаковое сообщение подряд (sendDirectMessage).
  */
  async function handleSubmit(formData: FormData) {
    if (sending.current) return;
    sending.current = true;
    try {
      const result = await sendMessageAction({}, formData);
      setState(result);
      if (result.ok) setText("");
    } catch (error) {
      if (guardStale(error)) return;
      // Сети нет: действие бросает, а не возвращает отказ. Текст в поле остаётся
      setState({ error: "Не отправилось: нет связи с сервером. Попробуйте ещё раз" });
    } finally {
      sending.current = false;
    }
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
                          m.fromMe ? "text-primary-foreground" : "text-muted-foreground",
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
          <AttachmentMenu />
          <AutoGrowTextarea
            name="body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            required
            maxLength={5000}
            placeholder="Сообщение"
            aria-label="Текст сообщения"
            className="min-h-11 flex-1 resize-none rounded-3xl px-4 py-2.5"
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
          <Submit />
        </div>
        <FormMessage error={state.error} className="mt-2 py-2" />
      </form>
    </div>
  );
}

/** Один ли это «залп» сообщений: тот же автор и меньше пяти минут разрыва. */
function isSameBurst(previous: ThreadMessage, current: ThreadMessage): boolean {
  if (previous.fromMe !== current.fromMe) return false;
  return current.createdAt.getTime() - previous.createdAt.getTime() < 5 * 60_000;
}
