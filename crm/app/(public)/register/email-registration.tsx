"use client";

import { useActionState, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";

type Contact = { email: string; phone: string; password: string };

function SubmitButton({
  pendingLabel,
  label,
  dimmed = false,
}: {
  pendingLabel: string;
  label: string;
  /** Блеклая, пока нет согласия: нажать можно — подсветится галочка. */
  dimmed?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={cn("w-full", dimmed && "opacity-50")} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Вкладка «Почта» на /register: почта, телефон и пароль → код из письма →
 * вход (lib/services/registration.ts). Прежняя форма /register/company,
 * та же логика и те же действия; галочка согласия теперь общая на все
 * способы и приходит от страницы (consentBox), как у телефона.
 */
export function EmailRegistration({
  consent,
  consentBox,
  onNeedsConsent,
}: {
  consent: boolean;
  /** Галочка согласия — между полями и кнопкой, как у остальных способов. */
  consentBox: ReactNode;
  /** Нажали «Получить код» до согласия — страница подсветит галочку. */
  onNeedsConsent: () => void;
}) {
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
    <form
      action={requestAction}
      className="space-y-4"
      onSubmit={(e) => {
        // Поля проверяет браузер раньше этого обработчика: с пустой
        // почтой согласие ничего не решит, а ошибка должна стоять у поля
        if (!consent) {
          e.preventDefault();
          onNeedsConsent();
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Рабочая почта</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
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

      {consentBox}

      {requestState.error && (
        <Alert variant="destructive">
          <AlertDescription>{requestState.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton
        pendingLabel="Отправляем код…"
        label="Получить код на почту"
        dimmed={!consent}
      />
    </form>
  );
}
