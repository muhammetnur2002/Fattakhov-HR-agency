"use client";

import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  endpointFingerprint,
  enableThisDevice,
  isAndroid,
  isIos,
  pushServiceText,
  PushServiceUnavailable,
  pushSupport,
  subscribedWithKey,
  type PushSupport,
} from "@/lib/notifications/push-client";

type View =
  | { kind: "hidden" }
  | { kind: "ask" }
  | { kind: "hint"; text: string }
  | { kind: "done" };

const HINTS: Record<Exclude<PushSupport, "supported" | "unsupported">, string> = {
  "in-app":
    "Сейчас кабинет открыт во встроенном браузере приложения — там уведомления не работают. Откройте его в обычном браузере.",
  "ios-browser":
    "На iPhone и iPad уведомления приходят, если добавить кабинет на экран «Домой»: «Поделиться» → «На экран „Домой“», затем откройте его оттуда.",
  "ios-outdated": "Для уведомлений на iPhone и iPad нужна iOS 16.4 или новее. Обновите систему.",
};

/**
 * Предложение разрешить уведомления от кабинета — плашка над содержимым.
 *
 * Показывается при каждом заходе, пока это устройство не подписано.
 * «Закрыть» прячет её до конца визита (вкладки); с галочкой «Больше не
 * показывать» — навсегда на этом устройстве. Подписка — свойство браузера,
 * поэтому и отказ хранится в браузере, отдельно для каждого пользователя.
 *
 * Не показывается, если человек снял галочку «Уведомления на телефон и
 * компьютер» в настройках: он их уже выключил сознательно.
 */
export function PushPrompt({
  userId,
  publicKey,
  devices,
}: {
  userId: string;
  publicKey: string;
  /** Отпечатки устройств, которые сервер знает за этим человеком. */
  devices: string[];
}) {
  const [view, setView] = useState<View>({ kind: "hidden" });
  const [never, setNever] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `fhr-push-prompt:${userId}`;
  // Строка, а не массив: новый массив с тем же содержимым не должен перезапускать проверку
  const known = devices.join(" ");

  useEffect(() => {
    let cancelled = false;
    const show = (next: View) => {
      if (!cancelled) setView(next);
    };
    void (async () => {
      try {
        if (
          localStorage.getItem(storageKey) === "never" ||
          sessionStorage.getItem(storageKey) === "later"
        ) {
          return;
        }
      } catch {
        /* хранилище закрыто — показываем как обычно */
      }
      try {
        const support = pushSupport();
        if (support === "unsupported") return;
        if (support !== "supported") return show({ kind: "hint", text: HINTS[support] });
        if (Notification.permission === "denied") {
          return show({
            kind: "hint",
            text: isIos()
              ? "Уведомления для кабинета запрещены в настройках телефона. Откройте «Настройки» → «Уведомления» → кабинет и разрешите их."
              : "Уведомления для этого сайта запрещены в настройках браузера. Нажмите на значок слева от адреса сайта → «Уведомления» → «Разрешить» и обновите страницу." +
                (isAndroid()
                  ? " Если там уже «Разрешить» — включите уведомления самому браузеру: «Настройки» телефона → «Приложения» → браузер → «Уведомления»."
                  : ""),
          });
        }

        // Подписано и в браузере (на нынешний ключ), и у сервера за этим человеком — предлагать нечего
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription && subscribedWithKey(subscription, publicKey)) {
          const fingerprint = await endpointFingerprint(subscription.endpoint);
          if (known.split(" ").includes(fingerprint)) return;
        }
        show({ kind: "ask" });
      } catch {
        /* без предложения — не беда */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, publicKey, known]);

  function close() {
    try {
      if (never) localStorage.setItem(storageKey, "never");
      else sessionStorage.setItem(storageKey, "later");
    } catch {
      /* не запомнилось — в следующий раз покажем снова */
    }
    setView({ kind: "hidden" });
  }

  async function enable() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const outcome = await enableThisDevice(publicKey);
      if (outcome.kind === "permission") {
        // Закрыли системный запрос или запретили: плашка остаётся до закрытия
        if (outcome.permission === "denied") {
          setView({
            kind: "hint",
            text: "Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и обновите страницу.",
          });
        }
        return;
      }
      if (outcome.result.error) setError(outcome.result.error);
      else setView({ kind: "done" });
    } catch (cause) {
      console.warn("[пуш] не удалось включить", cause);
      setError(
        cause instanceof PushServiceUnavailable
          ? pushServiceText()
          : "Браузер не дал подписаться на уведомления. Обновите страницу и попробуйте ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  if (view.kind === "hidden") return null;

  if (view.kind === "done") {
    return (
      <Alert className="relative mb-4 pr-10">
        <BellRing />
        <AlertTitle>Уведомления включены</AlertTitle>
        <AlertDescription>
          Проверочное уведомление отправлено на это устройство.
        </AlertDescription>
        <button
          type="button"
          onClick={() => setView({ kind: "hidden" })}
          aria-label="Скрыть"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </Alert>
    );
  }

  return (
    <Alert className="relative mb-4 pr-10">
      <BellRing />
      <AlertTitle>
        {view.kind === "ask" ? "Разрешите уведомления от кабинета" : "Уведомления от кабинета"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {view.kind === "ask"
            ? "Кандидаты и решения, комментарии, сообщения, встречи и счета — сразу уведомлением на экран, без захода в почту."
            : view.text}
        </p>
        {error && <p className="mt-1 text-destructive">{error}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {view.kind === "ask" && (
            <Button type="button" size="sm" onClick={() => void enable()} disabled={pending}>
              {pending ? "Включаем…" : "Разрешить уведомления"}
            </Button>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={never}
              onChange={(event) => setNever(event.target.checked)}
              className="size-4"
            />
            Больше не показывать
          </label>
        </div>
      </AlertDescription>
      <button
        type="button"
        onClick={close}
        aria-label={never ? "Закрыть и больше не показывать" : "Закрыть до следующего захода"}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </Alert>
  );
}
