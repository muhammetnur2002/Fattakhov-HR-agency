"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";

import { logout } from "@/app/actions/auth";
import { confirmTwoFactorAction, type TwoFactorState } from "@/app/actions/two-factor";
import {
  ConfirmSetup,
  RecoveryCodes,
  StartSetup,
  type TwoFactorSetupData,
} from "@/components/settings/two-factor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { TwoFactorStatus } from "@/lib/services/two-factor";

/**
 * Принудительная настройка 2FA сотрудника агентства.
 *
 * Три шага на одном экране: подтвердить личность и получить ключ, ввести
 * код из приложения, сохранить коды восстановления. Выйти из кабинета можно
 * на любом шаге — других выходов отсюда нет, пока 2FA не включена.
 */
export function TwoFactorRequired({
  status,
  enabled,
  homeHref,
}: {
  status: Pick<TwoFactorStatus, "proof" | "maskedPhone">;
  /** Уже включена на сервере. Без кодов в этом экране — значит, настройка давно позади. */
  enabled: boolean;
  homeHref: string;
}) {
  const [setup, setSetup] = useState<TwoFactorSetupData | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmState, confirmAction] = useActionState<TwoFactorState, FormData>(
    confirmTwoFactorAction,
    {},
  );

  const codes = confirmState.codes;
  const step = codes ? 3 : setup ? 2 : 1;

  // Включена раньше и коды в этом экране не выдавались — показывать нечего
  if (enabled && !codes) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Двухфакторная защита включена</h1>
        <p className="text-sm text-muted-foreground">
          Настройка завершена, дальше при входе спрашивается код из приложения.
        </p>
        <Button type="button" onClick={() => window.location.assign(homeHref)}>
          Перейти в кабинет
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Включите двухфакторную защиту</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Для сотрудников агентства она обязательна: в кабинете персональные
            данные кандидатов, и одного пароля для них мало. Это нужно сделать
            один раз, дальше — код из приложения при входе.
          </p>
        </div>
      </div>

      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Шаг {step} из 3
      </p>

      {step === 1 && <StartSetup status={status} onStarted={setSetup} buttonLabel="Продолжить" />}

      {step === 2 && setup && (
        <ConfirmSetup
          setup={setup}
          formAction={confirmAction}
          error={confirmState.error}
          submitLabel="Подтвердить и включить"
        />
      )}

      {step === 3 && codes && (
        <div className="space-y-5">
          <RecoveryCodes codes={codes} />

          <div className="flex items-start gap-3">
            <Checkbox
              id="codes-saved"
              checked={saved}
              onCheckedChange={(value) => setSaved(value === true)}
              className="mt-0.5"
            />
            <Label htmlFor="codes-saved" className="text-sm leading-snug font-normal">
              Я сохранил(а) коды восстановления в надёжном месте
            </Label>
          </div>

          <Button
            type="button"
            disabled={!saved}
            className="w-full sm:w-auto"
            // Полная загрузка, а не переход внутри приложения: кабинет должен
            // прочитать уже включённую 2FA заново, без кэша экрана настройки
            onClick={() => window.location.assign(homeHref)}
          >
            Войти в кабинет
          </Button>
        </div>
      )}

      {step < 3 && (
        <form action={logout} className="border-t pt-4">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Выйти из кабинета
          </Button>
        </form>
      )}
    </div>
  );
}
