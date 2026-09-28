"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmCompanyRegistrationAction,
  requestCompanyRegistrationAction,
  type RegisterState,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRIVACY_POLICY_PATH } from "@/lib/legal/consent-texts";
import { REGISTRATION_CONSENT_TEXT } from "@/lib/legal/registration-consent";

type Contact = { email: string; phone: string; password: string };

function SubmitButton({ pendingLabel, label }: { pendingLabel: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CompanyRegisterForm() {
  // Данные первого экрана живут в состоянии на этой же странице: второй
  // экран — тот же компонент, а не отдельный маршрут. Пароль здесь нужен
  // только на один вызов входа после подтверждения кода, второй раз
  // хешировать его незачем, поэтому в БД между экранами он не заезжает.
  const [contact, setContact] = useState<Contact | null>(null);

  const [requestState, requestAction] = useActionState<RegisterState, FormData>(
    async (prev, formData) => {
      const result = await requestCompanyRegistrationAction(prev, formData);
      if (result.sent) {
        setContact({
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          password: String(formData.get("password") ?? ""),
        });
      }
      return result;
    },
    {},
  );

  const [confirmState, confirmAction] = useActionState<RegisterState, FormData>(
    confirmCompanyRegistrationAction,
    {},
  );

  if (requestState.sent && contact) {
    return (
      <form action={confirmAction} className="space-y-4">
        <input type="hidden" name="email" value={contact.email} />
        <input type="hidden" name="phone" value={contact.phone} />
        <input type="hidden" name="password" value={contact.password} />

        <p className="text-sm text-muted-foreground">
          Код отправлен на {contact.email}. Введите его ниже — это займёт
          пару минут.
        </p>

        <div className="space-y-2">
          <Label htmlFor="code">Код из письма</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
          />
        </div>

        {confirmState.error && (
          <Alert variant="destructive">
            <AlertDescription>{confirmState.error}</AlertDescription>
          </Alert>
        )}

        <SubmitButton pendingLabel="Проверяем…" label="Подтвердить и войти" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setContact(null)}
        >
          Указать другую почту
        </Button>
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Рабочая почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Телефон</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+7 999 000-00-00"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="text-xs text-muted-foreground">
          Не короче 10 символов. Длинная фраза надёжнее короткого набора
          символов и запоминается легче.
        </p>
      </div>

      <label htmlFor="consent" className="flex cursor-pointer gap-3 pt-1">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-graphite"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          {REGISTRATION_CONSENT_TEXT}{" "}
          <a
            href={PRIVACY_POLICY_PATH}
            target="_blank"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Политика обработки персональных данных
          </a>
          .
        </span>
      </label>

      {requestState.error && (
        <Alert variant="destructive">
          <AlertDescription>{requestState.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton pendingLabel="Отправляем код…" label="Получить код на почту" />
    </form>
  );
}
