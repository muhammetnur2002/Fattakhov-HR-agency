"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  markConversationReadAction,
  sendMessageAction,
  type MessageState,
} from "@/app/actions/messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <Button type="submit" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить"}
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

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Переписки пока нет. Напишите первым.
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm sm:max-w-[70%]",
                  m.fromMe
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <div className="whitespace-pre-line break-words">{m.body}</div>
                <div
                  className={cn(
                    "mt-1 text-xs",
                    m.fromMe
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {formatWhen(m.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form ref={formRef} action={handleSubmit} className="space-y-2 border-t pt-4">
        <input type="hidden" name="recipientId" value={recipientId} />
        <Textarea
          name="body"
          rows={3}
          required
          maxLength={5000}
          placeholder="Написать сообщение…"
          aria-label="Текст сообщения"
        />
        <div className="flex items-center gap-3">
          <Submit />
          {state.error && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
        </div>
      </form>
    </div>
  );
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
