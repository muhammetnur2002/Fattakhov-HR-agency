"use client";

import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateCodesAction,
  requestTwoFactorSmsAction,
  startTwoFactorAction,
  type TwoFactorState,
} from "@/app/actions/two-factor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TwoFactorStatus } from "@/lib/services/two-factor";

export type TwoFactorSetupData = NonNullable<TwoFactorState["setup"]>;

function SubmitButton({
  label,
  variant = "default",
  className,
}: {
  label: string;
  variant?: "default" | "outline" | "destructive";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? "Секунду…" : label}
    </Button>
  );
}

/**
 * Коды восстановления.
 *
 * Показываются ровно один раз: в базе лежат хеши, и восстановить
 * исходные значения нельзя. Поэтому экран настойчиво просит их
 * сохранить, а не просто выводит списком.
 */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-secondary/40 p-4">
      <div>
        <div className="font-medium">Коды восстановления</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Сохраните их сейчас. Второй раз показать не сможем: в базе лежат
          только отпечатки. Каждый код срабатывает один раз и заменяет код
          из приложения, если телефон недоступен.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-sm tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          } catch {
            // Без доступа к буферу обмена коды остаются на экране — их можно переписать
          }
        }}
      >
        {copied ? "Скопировано" : "Скопировать все"}
      </Button>
    </div>
  );
}

/**
 * Первый шаг подключения: подтвердить, что это вы, и получить секрет.
 *
 * Пароль нужен всегда, у кого он есть: без него украденная сессия
 * включала бы 2FA на телефоне вора и запирала владельца. У вошедших по SMS
 * пароля нет — им код из SMS на проверенный телефон. У тех, у кого нет
 * ни того ни другого, сначала пароль — через «Забыли пароль».
 */
export function StartSetup({
  status,
  onStarted,
  buttonLabel = "Включить",
}: {
  status: Pick<TwoFactorStatus, "proof" | "maskedPhone">;
  onStarted: (setup: TwoFactorSetupData) => void;
  buttonLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [smsSentTo, setSmsSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status.proof === "none") {
    return (
      <Alert>
        <AlertDescription>
          У вашей учётной записи нет пароля, а без него включить второй фактор
          нельзя.{" "}
          <Link href="/forgot" className="font-medium underline underline-offset-4">
            Задайте пароль через «Забыли пароль»
          </Link>{" "}
          — ссылка придёт на вашу почту, — и вернитесь сюда.
        </AlertDescription>
      </Alert>
    );
  }

  const usesSms = status.proof === "sms";

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await startTwoFactorAction(
            usesSms
              ? { smsCode: String(form.get("proof") ?? "") }
              : { password: String(form.get("proof") ?? "") },
          );
          if (result.error) setError(result.error);
          else if (result.setup) onStarted(result.setup);
        });
      }}
    >
      {usesSms && !smsSentTo ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            У вас нет пароля, поэтому подтвердим кодом из SMS
            {status.maskedPhone ? ` на ${status.maskedPhone}` : ""}.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await requestTwoFactorSmsAction();
                if (result.error) setError(result.error);
                else setSmsSentTo(result.sentTo ?? "вашего телефона");
              })
            }
          >
            {pending ? "Отправляем…" : "Получить код по SMS"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="proof">
            {usesSms ? `Код из SMS (отправлен на ${smsSentTo})` : "Текущий пароль"}
          </Label>
          <Input
            id="proof"
            name="proof"
            type={usesSms ? "text" : "password"}
            inputMode={usesSms ? "numeric" : undefined}
            autoComplete={usesSms ? "one-time-code" : "current-password"}
            placeholder={usesSms ? "123456" : "Ваш текущий пароль"}
            required
            autoFocus
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(!usesSms || smsSentTo) && (
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Готовим…" : buttonLabel}
        </Button>
      )}
    </form>
  );
}

/** Второй шаг: QR, ключ вручную и ввод кода из приложения. */
export function ConfirmSetup({
  setup,
  formAction,
  error,
  submitLabel = "Включить",
}: {
  setup: TwoFactorSetupData;
  formAction: (formData: FormData) => void;
  error?: string;
  submitLabel?: string;
}) {
  return (
    <div className="space-y-5">
      <ol className="space-y-4 text-sm">
        <li>
          <div className="font-medium">Отсканируйте код</div>
          <p className="mt-1 text-muted-foreground">
            Любым приложением-аутентификатором: Яндекс Ключ, Google
            Authenticator, 1Password.
          </p>
          <Image
            src={setup.qr}
            alt="QR-код для приложения-аутентификатора"
            width={200}
            height={200}
            unoptimized
            className="mt-3 rounded-lg border bg-white p-2"
          />
        </li>

        <li>
          <div className="font-medium">Или введите ключ вручную</div>
          <code className="mt-2 block rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
            {setup.secret}
          </code>
        </li>
      </ol>

      <form action={formAction} className="space-y-3 border-t pt-5">
        <div className="space-y-2">
          <Label htmlFor="totp-code">Код из приложения</Label>
          <Input
            id="totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            autoFocus
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <SubmitButton label={submitLabel} className="w-full sm:w-auto" />
      </form>
    </div>
  );
}

export function TwoFactorSettings({ status }: { status: TwoFactorStatus }) {
  const [setup, setSetup] = useState<TwoFactorSetupData | null>(null);

  const [confirmState, confirmAction] = useActionState<TwoFactorState, FormData>(
    confirmTwoFactorAction,
    {},
  );
  const [disableState, disableAction] = useActionState<TwoFactorState, FormData>(
    disableTwoFactorAction,
    {},
  );
  const [codesState, codesAction] = useActionState<TwoFactorState, FormData>(
    regenerateCodesAction,
    {},
  );

  const freshCodes = confirmState.codes ?? codesState.codes;

  // Коды показываем сразу после выдачи, даже если фактор только что
  // включили: это единственный момент, когда они существуют в открытом виде
  if (freshCodes) {
    return (
      <div className="space-y-4">
        {(confirmState.ok ?? codesState.ok) && (
          <Alert>
            <AlertDescription>{confirmState.ok ?? codesState.ok}</AlertDescription>
          </Alert>
        )}
        <RecoveryCodes codes={freshCodes} />
      </div>
    );
  }

  if (status.enabled) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border bg-secondary/30 p-3.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm">
            <div className="font-medium">Включена</div>
            <p className="mt-0.5 text-muted-foreground">
              Осталось кодов восстановления: {status.recoveryCodesLeft} из 10.
              {status.recoveryCodesLeft <= 3 &&
                " Их стоит перевыпустить, пока они не кончились."}
            </p>
          </div>
        </div>

        <form action={codesAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="regen-password">
              Перевыпустить коды восстановления
            </Label>
            <Input
              id="regen-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Подтвердите паролем"
              required
            />
            <p className="text-xs text-muted-foreground">
              Прежние коды перестанут работать.
            </p>
          </div>
          {codesState.error && (
            <Alert variant="destructive">
              <AlertDescription>{codesState.error}</AlertDescription>
            </Alert>
          )}
          <SubmitButton label="Перевыпустить" variant="outline" />
        </form>

        {status.required ? (
          // Сотрудникам агентства отключить нельзя вообще — формы нет, а не форма с отказом
          <p className="border-t pt-5 text-sm text-muted-foreground">
            Для сотрудников агентства двухфакторная аутентификация обязательна
            и не отключается.
          </p>
        ) : (
          <form action={disableAction} className="space-y-3 border-t pt-5">
            <div className="space-y-2">
              <Label htmlFor="disable-password">Выключить двухфакторную</Label>
              <Input
                id="disable-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Подтвердите паролем"
                required
              />
            </div>
            {disableState.error && (
              <Alert variant="destructive">
                <AlertDescription>{disableState.error}</AlertDescription>
              </Alert>
            )}
            {disableState.ok && (
              <Alert>
                <AlertDescription>{disableState.ok}</AlertDescription>
              </Alert>
            )}
            <SubmitButton label="Выключить" variant="destructive" />
          </form>
        )}
      </div>
    );
  }

  if (setup) {
    return (
      <ConfirmSetup setup={setup} formAction={confirmAction} error={confirmState.error} />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Второй фактор защищает кабинет, даже если пароль утёк. При включении
        выдадим десять кодов восстановления: они нужны, если телефон
        потерялся или разбился.
      </p>

      <StartSetup status={status} onStarted={setSetup} />
    </div>
  );
}
