"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  issueVkLinkCodeAction,
  unlinkVkAction,
  vkLinkStatusAction,
} from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";
import { FormMessage } from "@/components/ui/form-message";
import { useTimeZone } from "@/components/shell/time-zone-provider";
import { formatTime } from "@/lib/format-date";
import { CopyButton } from "@/components/shared/copy-button";

/** Как часто спрашиваем, дошёл ли код. Чаще незачем: человек ещё переключается в ВК. */
const POLL_MS = 3000;

/**
 * Привязка ВКонтакте кодом. Не часть формы настроек: кнопки здесь —
 * обычные действия, а не отправка формы, поэтому блок стоит внутри неё
 * и у каждой кнопки type="button".
 *
 * Страницу человека не просим: код, который он напишет сообществу,
 * сам говорит ВК, от какой страницы пришло сообщение.
 *
 * Привязать можно сколько угодно раз: «Отвязать» снимает страницу и
 * гасит выданные коды, «Привязать заново» выдаёт новый код поверх
 * прежней привязки (страница заменится той, с которой напишут).
 * Пока код на экране, блок сам опрашивает сервер и показывает итог —
 * жать «проверить» руками не нужно.
 */
export function VkLinkBlock({
  vkUserId,
  messageUrl,
}: {
  vkUserId: string | null;
  /** Личные сообщения с сообществом (vk.me/club…) — туда отправляют код. */
  messageUrl: string | null;
}) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const {
    triggerRef: unlinkTrigger,
    focusRef: unlinkFocus,
    questionId: unlinkQuestionId,
    groupProps: unlinkGroup,
  } = useConfirmFocus(confirmingUnlink);
  const codeRef = useRef<HTMLParagraphElement>(null);

  // Пока код на экране — ждём сообщение. Не опрашиваем вкладку в фоне:
  // человек в ВК, а запросы впустую никому не нужны
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const result = await vkLinkStatusAction(code.value);
        if (cancelled) return;
        if (result.status === "linked") {
          setCode(null);
          setNotice("Готово: страница ВКонтакте привязана.");
          router.refresh();
        } else if (result.status === "expired") {
          setCode(null);
          setNotice("Код больше не действует. Получите новый.");
        }
      } catch {
        // Сеть моргнула — следующий опрос повторит
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, router]);

  function requestCode() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await issueVkLinkCodeAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCode({ value: result.code, expiresAt: result.expiresAt });
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      await unlinkVkAction();
      setCode(null);
      setConfirmingUnlink(false);
      setNotice("Страница отвязана. Привязать можно снова — получите новый код.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {vkUserId ? (
          <>
            Привязана страница ВКонтакте:{" "}
            <a
              href={`https://vk.com/id${vkUserId}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              vk.com/id{vkUserId}
            </a>
            .
          </>
        ) : (
          <span className="text-muted-foreground">
            ВКонтакте пока не привязан — уведомления в него не придут.
          </span>
        )}
      </p>

      {notice && (
        <p role="status" className="text-sm text-foreground">
          {notice}
        </p>
      )}

      {code ? (
        <Panel tone="muted">
          <div className="flex items-center gap-2">
            <p
              ref={codeRef}
              aria-label={`Код привязки: ${code.value}`}
              className="font-mono text-2xl font-semibold tracking-widest tabular-nums"
            >
              {code.value}
            </p>
            {/* Без буфера обмена скажет «Скопируйте вручную» и выделит цифры */}
            <CopyButton text={code.value} targetRef={codeRef} iconOnly size="default" ariaLabel="Скопировать код" />
          </div>

          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Скопируйте код кнопкой рядом с цифрами.</li>
            <li>
              Нажмите «Открыть чат с сообществом» — во ВКонтакте откроется личная
              переписка с сообществом агентства. Если внизу есть кнопка
              «Начать» или «Разрешить сообщения», нажмите её: сообщество
              поздоровается и объяснит, что делать.
            </li>
            <li>
              Отправьте код в этот чат одним сообщением, только цифры. Сообщество
              ответит «Готово», а эта страница обновится сама.
            </li>
          </ol>

          <p className="text-xs text-muted-foreground">
            Код действует до{" "}
            {formatTime(code.expiresAt, timeZone)}
            . Писать его надо именно в личные сообщения сообщества, не на стене
            и не в комментариях.
          </p>

          <div className="flex flex-wrap gap-2">
            {messageUrl && (
              <Button asChild size="sm">
                <a href={messageUrl} target="_blank" rel="noreferrer">
                  Открыть чат с сообществом
                </a>
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setCode(null)}>
              Отмена
            </Button>
          </div>
        </Panel>
      ) : confirmingUnlink ? (
        <div {...unlinkGroup} className="flex flex-wrap items-center gap-2">
          <span id={unlinkQuestionId} className="text-sm">
            Отвязать страницу? Уведомления в ВКонтакте перестанут приходить.
          </span>
          <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={unlink}>
            Да, отвязать
          </Button>
          <Button
            ref={unlinkFocus}
            aria-describedby={unlinkQuestionId}
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmingUnlink(false)}
          >
            Отмена
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={requestCode}>
            {vkUserId ? "Привязать заново" : "Получить код привязки"}
          </Button>
          {vkUserId && (
            <Button
              ref={unlinkTrigger}
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNotice(null);
                setConfirmingUnlink(true);
              }}
            >
              Отвязать
            </Button>
          )}
        </div>
      )}

      <FormMessage error={error} />
    </div>
  );
}
