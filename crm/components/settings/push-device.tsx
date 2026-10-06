"use client";

import { useEffect, useState, useTransition } from "react";

import {
  removeOtherPushDevicesAction,
  sendTestPushAction,
  unsubscribePushAction,
  type PushActionResult,
  type PushTestResult,
} from "@/app/actions/push";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/notifications/events";
import {
  endpointFingerprint,
  enableThisDevice,
  inAppBrowser,
  isIos,
  pushServiceText,
  PushServiceUnavailable,
  pushSupport,
  type InAppBrowser,
  isAndroid,
  registerPushWorker,
  subscribedWithKey,
} from "@/lib/notifications/push-client";

/** Устройство с уведомлениями — без адреса подписки, только отпечаток. */
export type PushDeviceRef = { id: string; endpointHash: string };

type DeviceState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "in-app"; app: InAppBrowser["app"]; ios: boolean }
  | { kind: "ios-browser" }
  | { kind: "ios-outdated" }
  | { kind: "denied"; device: Device }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

type Detected = {
  state: DeviceState;
  /** Отпечаток подписки этого браузера, если она есть, — даже чужой. */
  fingerprint: string | null;
};

type Device = "ios" | "android" | "other";

/**
 * «Уведомления на это устройство».
 *
 * Пуш включается на каждом устройстве отдельно: подписка — свойство
 * браузера, а не учётной записи. Поэтому состояние узнаётся здесь,
 * в браузере, и сверяется с тем, что сервер знает за этим человеком
 * (отпечатки адресов подписок, devices): подписка в браузере, которой
 * у сервера за ним нет, — чужая (до него с этого устройства подписывался
 * другой) или уже погашенная, и «включено» тут было бы неправдой.
 */
export function PushDevice({
  publicKey,
  devices,
  paused,
}: {
  publicKey: string;
  devices: PushDeviceRef[];
  /** Галочка «Уведомления на телефон и компьютер» снята и сохранена. */
  paused: boolean;
}) {
  const [state, setState] = useState<DeviceState>({ kind: "checking" });
  /*
    Отпечаток подписки этого браузера — нынешней или только что снятой.
    Он не входит в «остальные устройства», даже пока сервер не прислал
    обновлённый список: иначе сразу после «Отключить» это же устройство
    на миг числилось бы «другим».
  */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [result, setResult] = useState<PushActionResult | null>(null);
  const [test, setTest] = useState<PushTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, startTransition] = useTransition();

  // Строка, а не массив: после каждого действия сервер присылает новый
  // массив с тем же содержимым, и проверка не должна запускаться зря
  const known = devices.map((d) => d.endpointHash).join(" ");

  useEffect(() => {
    let cancelled = false;
    void detect(publicKey, known.split(" ").filter(Boolean)).then((next) => {
      if (cancelled) return;
      setState(next.state);
      setFingerprint(next.fingerprint);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey, known]);

  function enable() {
    setResult(null);
    setTest(null);
    startTransition(async () => {
      try {
        const outcome = await enableThisDevice(publicKey);
        if (outcome.kind === "permission") {
          setState(outcome.permission === "denied" ? { kind: "denied", device: device() } : { kind: "off" });
          return;
        }
        setResult(outcome.result);
        setFingerprint(await endpointFingerprint(outcome.endpoint));
        if (!outcome.result.error) setState({ kind: "on", endpoint: outcome.endpoint });
      } catch (error) {
        console.warn("[пуш] не удалось включить", error);
        setResult({
          error:
            error instanceof PushServiceUnavailable
              ? pushServiceText()
              : "Браузер не дал подписаться на уведомления. Обновите страницу и попробуйте ещё раз.",
        });
      }
    });
  }

  function disable() {
    if (state.kind !== "on") return;
    const { endpoint } = state;
    setResult(null);
    startTransition(async () => {
      // Сначала сервер: если браузер отписаться не сможет, слать сюда
      // всё равно перестанут
      const outcome = await unsubscribePushAction({ endpoint });
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription?.endpoint === endpoint) await subscription.unsubscribe();
      } catch (error) {
        console.warn("[пуш] браузер не отписался", error);
      }
      setResult(outcome);
      if (!outcome.error) setState({ kind: "off" });
    });
  }

  function sendTest() {
    setResult(null);
    setTest(null);
    setTesting(true);
    startTransition(async () => {
      try {
        setTest(await sendTestPushAction());
      } catch (error) {
        console.warn("[пуш] проверка не отправилась", error);
        setTest({ error: "Не удалось отправить проверочное уведомление. Обновите страницу и попробуйте ещё раз." });
      } finally {
        setTesting(false);
      }
    });
  }

  function disableOthers() {
    const keepEndpoint = state.kind === "on" ? state.endpoint : undefined;
    setResult(null);
    startTransition(async () => {
      setResult(await removeOtherPushDevicesAction({ keepEndpoint }));
    });
  }

  const others = devices.filter((d) => d.endpointHash !== fingerprint).length;

  return (
    <div className="space-y-2" data-push-state={state.kind}>
      <div className="text-sm font-medium">Уведомления на это устройство</div>
      <p className="text-xs text-muted-foreground">{stateText(state)}</p>

      {state.kind === "off" && (
        <Button type="button" size="sm" onClick={enable} disabled={pending}>
          {pending ? "Включаем…" : "Включить"}
        </Button>
      )}
      {state.kind === "on" && (
        <Button type="button" size="sm" variant="outline" onClick={disable} disabled={pending}>
          {pending ? "Отключаем…" : "Отключить на этом устройстве"}
        </Button>
      )}

      {state.kind === "on" && paused && (
        <p className="text-xs text-muted-foreground">
          Галочка «Уведомления на телефон и компьютер» выше снята: пока она
          снята, уведомления не приходят ни на одно устройство.
        </p>
      )}

      {/*
        Проверка идёт на ВСЕ устройства человека, а не только на это:
        кнопка нужна, когда уведомления «включены, но не приходят», —
        и тогда достаточно знать, что они включены хоть где-то.
      */}
      {devices.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={sendTest}
          disabled={pending}
        >
          {testing ? "Отправляем…" : "Отправить проверочное уведомление"}
        </Button>
      )}

      {state.kind !== "checking" && others > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {state.kind === "on" ? "Ещё включены" : "Включены"} на {others}{" "}
            {plural(others, "устройстве", "устройствах", "устройствах")}
            {state.kind === "on" ? "" : " — не на этом"}.
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-0 text-xs underline underline-offset-2"
            onClick={disableOthers}
            disabled={pending}
          >
            {state.kind === "on" ? "Отключить там" : "Отключить на них"}
          </Button>
        </div>
      )}

      {result?.ok && (
        <Alert>
          <AlertDescription className="text-sm">{result.ok}</AlertDescription>
        </Alert>
      )}
      {result?.warning && (
        <Alert>
          <AlertDescription className="text-sm">{result.warning}</AlertDescription>
        </Alert>
      )}
      {result?.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{result.error}</AlertDescription>
        </Alert>
      )}

      {test?.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{test.error}</AlertDescription>
        </Alert>
      )}
      {test?.devices && (
        <Alert data-push-test>
          <AlertDescription className="space-y-2 text-sm">
            <p className="font-medium">{test.summary}</p>
            <ul className="space-y-1.5">
              {test.devices.map((device, index) => (
                <li key={index} className="flex gap-2">
                  <span
                    aria-hidden
                    className={
                      device.state === "sent"
                        ? "mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500"
                        : "mt-1.5 size-2 shrink-0 rounded-full bg-destructive"
                    }
                  />
                  <span>
                    <span className="font-medium">{device.label}:</span> {device.text}
                  </span>
                </li>
              ))}
            </ul>
            {test.note && <p className="text-muted-foreground">{test.note}</p>}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function stateText(state: DeviceState): string {
  switch (state.kind) {
    case "checking":
      return "Проверяем, умеет ли этот браузер получать уведомления…";
    case "unsupported":
      return (
        "Этот браузер не умеет получать уведомления от сайтов. Откройте кабинет " +
        "в Chrome, Safari, Firefox, Edge или Яндекс Браузере — уведомления " +
        "включаются на каждом устройстве отдельно."
      );
    case "in-app": {
      const where = state.app
        ? `Кабинет открыт внутри ${state.app}, а во встроенном браузере приложения уведомления не приходят.`
        : "Кабинет открыт во встроенном браузере приложения — там уведомления не приходят.";
      return state.ios
        ? `${where} Откройте его в Safari (в меню «…» — «Открыть в Safari»), установите ` +
            "на экран «Домой» и включите уведомления там."
        : `${where} Откройте его в обычном браузере (в меню «⋮» — «Открыть в браузере») ` +
            "и включите уведомления там.";
    }
    case "ios-browser":
      return (
        "На iPhone и iPad уведомления приходят только кабинету, установленному " +
        "на экран «Домой» (iOS 16.4 и новее). Нажмите «Поделиться» → " +
        "«На экран „Домой“», откройте кабинет с появившейся иконки и включите " +
        "уведомления здесь."
      );
    case "ios-outdated":
      return "Уведомления на iPhone и iPad работают с iOS 16.4 — обновите систему, и здесь появится кнопка.";
    case "denied":
      if (state.device === "ios") {
        return (
          "Уведомления для кабинета запрещены в настройках телефона, отсюда их не включить. " +
          "Откройте «Настройки» → «Уведомления» → кабинет и разрешите уведомления, затем вернитесь сюда."
        );
      }
      return (
        "Уведомления для этого сайта запрещены в настройках браузера, отсюда их не включить. " +
        "Нажмите на значок слева от адреса сайта → «Уведомления» → «Разрешить» и обновите страницу." +
        // На Android браузер может молчать и с разрешением сайта: запрет
        // стоит у самого браузера в настройках телефона
        (state.device === "android"
          ? " Если там уже «Разрешить» — включите уведомления самому браузеру: " +
            "«Настройки» телефона → «Приложения» → браузер → «Уведомления»."
          : "")
      );
    case "off":
      return "Выключены на этом устройстве. Включаются на каждом телефоне и компьютере отдельно.";
    case "on":
      return "Включены на этом устройстве.";
  }
}

/** Что сейчас с этим устройством — по браузеру и по тому, что знает сервер. */
async function detect(publicKey: string, known: string[]): Promise<Detected> {
  const support = pushSupport();
  if (support === "in-app") {
    const app = inAppBrowser()?.app ?? null;
    return { state: { kind: "in-app", app, ios: isIos() }, fingerprint: null };
  }
  if (support !== "supported") return { state: { kind: support }, fingerprint: null };
  if (Notification.permission === "denied") {
    return { state: { kind: "denied", device: device() }, fingerprint: null };
  }

  const registration = await registerPushWorker();
  if (!registration) return { state: { kind: "unsupported" }, fingerprint: null };

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { state: { kind: "off" }, fingerprint: null };

  const fingerprint = await endpointFingerprint(subscription.endpoint);
  // На прежний ключ сервера или не за этим человеком — для него «выключено»
  const mine = known.includes(fingerprint) && subscribedWithKey(subscription, publicKey);
  return {
    state: mine ? { kind: "on", endpoint: subscription.endpoint } : { kind: "off" },
    fingerprint,
  };
}

function device(): Device {
  if (isIos()) return "ios";
  return isAndroid() ? "android" : "other";
}
