"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  issueVkLinkCodeAction,
  unlinkVkAction,
  vkLinkStatusAction,
} from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";

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
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [copied, setCopied] = useState(false);

  // «Скопировано» гаснет само, чтобы кнопка снова была готова к нажатию
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyCode(value: string) {
    if (await copyText(value)) setCopied(true);
    else setError("Не удалось скопировать — выделите цифры и скопируйте вручную.");
  }

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
        <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <p
              aria-label={`Код привязки: ${code.value}`}
              className="font-mono text-2xl font-semibold tracking-widest tabular-nums"
            >
              {code.value}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Скопировать код"
              title="Скопировать код"
              onClick={() => copyCode(code.value)}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
            <span role="status" className="text-xs text-muted-foreground">
              {copied ? "Скопировано" : ""}
            </span>
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
            {new Date(code.expiresAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
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
        </div>
      ) : confirmingUnlink ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            Отвязать страницу? Уведомления в ВКонтакте перестанут приходить.
          </span>
          <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={unlink}>
            Да, отвязать
          </Button>
          <Button
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Скопировать в буфер. Сначала современный способ; запасной — для окон без
 * доступа к clipboard (http, встроенные браузеры, старые версии): скрытое
 * поле и execCommand. Возвращает, получилось ли, — молча «скопировав»
 * ничего, кнопка заставила бы человека вставлять пустоту.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // пойдём запасным путём
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
