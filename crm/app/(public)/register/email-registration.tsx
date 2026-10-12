"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";

import {
  confirmCompanyRegistrationAction,
  requestCompanyRegistrationAction,
  type RegisterState,
} from "./actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Contact = { email: string; phone: string; password: string };

/** Через сколько секунд можно запросить код повторно: письма идут не мгновенно, и частый повтор только путает. */
const RESEND_SECONDS = 60;

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
  return (
    <SubmitButtonBase
      className="w-full"
      // Не disabled: нажатие подсвечивает галочку согласия. aria-disabled
      // говорит читателю экрана «пока недоступна», вид — серая плашка с читаемым текстом
      aria-disabled={dimmed || undefined}
      pendingLabel={pendingLabel}
    >
      {label}
    </SubmitButtonBase>
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
  // «Указать другую почту» возвращает к первой форме, но введённое остаётся: телефон и пароль
  // (10 и больше знаков) заново набирать незачем, меняется обычно одна почта
  const [editing, setEditing] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [resend, setResend] = useState<{ ok?: boolean; error?: string }>({});
  const [resending, startResend] = useTransition();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function resendCode() {
    if (!contact) return;
    const data = new FormData();
    data.set("email", contact.email);
    data.set("phone", contact.phone);
    data.set("password", contact.password);
    startResend(async () => {
      const result = await requestCompanyRegistrationAction({}, data);
      if (result.sent) {
        setResend({ ok: true });
        setResendIn(RESEND_SECONDS);
      } else {
        setResend({ error: result.error ?? "Не удалось отправить код. Попробуйте ещё раз" });
      }
    });
  }

  const [requestState, requestAction] = useActionState<RegisterState, FormData>(
    async (prev, formData) => {
      const result = await requestCompanyRegistrationAction(prev, formData);
      if (result.sent) {
        setContact({
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          password: String(formData.get("password") ?? ""),
        });
        setEditing(false);
        setResend({});
        setResendIn(RESEND_SECONDS);
      }
      return result;
    },
    {},
  );

  const [confirmState, confirmAction] = useActionState<RegisterState, FormData>(
    confirmCompanyRegistrationAction,
    {},
  );

  if (requestState.sent && contact && !editing) {
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

        <FormMessage error={confirmState.error} />

        <SubmitButton pendingLabel="Проверяем…" label="Подтвердить и войти" />

        <FormMessage
          error={resend.error}
          ok={resend.ok ? "Код отправлен ещё раз. Проверьте и папку «Спам»." : null}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={resending || resendIn > 0}
          onClick={resendCode}
        >
          {resendIn > 0 ? `Прислать код ещё раз через ${resendIn} с` : "Прислать код ещё раз"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setEditing(true)}
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
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={contact?.email} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Телефон</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+7 999 000-00-00"
          defaultValue={contact?.phone}
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
          defaultValue={contact?.password}
          required
        />
        <p className="text-xs text-muted-foreground">
          Не короче 10 символов. Длинная фраза надёжнее короткого набора
          символов и запоминается легче.
        </p>
      </div>

      {consentBox}

      <FormMessage error={requestState.error} />

      <SubmitButton
        pendingLabel="Отправляем код…"
        label="Получить код на почту"
        dimmed={!consent}
      />
    </form>
  );
}
