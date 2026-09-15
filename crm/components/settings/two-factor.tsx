"use client";

import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateCodesAction,
  startTwoFactorAction,
  type TwoFactorState,
} from "@/app/actions/two-factor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TwoFactorStatus } from "@/lib/services/two-factor";

function SubmitButton({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
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
function RecoveryCodes({ codes }: { codes: string[] }) {
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
          await navigator.clipboard.writeText(codes.join("\n"));
          setCopied(true);
        }}
      >
        {copied ? "Скопировано" : "Скопировать все"}
      </Button>
    </div>
  );
}

export function TwoFactorSettings({ status }: { status: TwoFactorStatus }) {
  const [setup, setSetup] = useState<TwoFactorState["setup"] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();

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
      </div>
    );
  }

  if (setup) {
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

        <form action={confirmAction} className="space-y-3 border-t pt-5">
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
          {confirmState.error && (
            <Alert variant="destructive">
              <AlertDescription>{confirmState.error}</AlertDescription>
            </Alert>
          )}
          <SubmitButton label="Включить" />
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Второй фактор защищает кабинет, даже если пароль утёк. При включении
        выдадим десять кодов восстановления: они нужны, если телефон
        потерялся или разбился.
      </p>

      {startError && (
        <Alert variant="destructive">
          <AlertDescription>{startError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        disabled={starting}
        onClick={() =>
          startTransition(async () => {
            const result = await startTwoFactorAction();
            if (result.error) setStartError(result.error);
            else setSetup(result.setup ?? null);
          })
        }
      >
        {starting ? "Готовим…" : "Включить"}
      </Button>
    </div>
  );
}
