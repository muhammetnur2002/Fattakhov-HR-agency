"use client";

import { Eye, EyeOff, Mail, Phone } from "lucide-react";
import { useState, useTransition } from "react";

import { revealStudentContactsAction } from "../actions";
import { Button } from "@/components/ui/button";

type Contacts = { email: string; phone: string | null };

/**
 * «Показать контакты» — отдельное явное действие. Контакты живут только в
 * состоянии этого компонента: их нет ни в адресе, ни в разметке страницы, ни в
 * кэше браузера (ответ серверного действия — это POST). «Скрыть» убирает их с
 * экрана; новый показ — новая запись в журнале доступа к персональным данным.
 */
export function RevealContacts({ studentId }: { studentId: string }) {
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await revealStudentContactsAction(studentId);
        if (result.contacts) setContacts(result.contacts);
        else setError(result.error ?? "Не удалось показать контакты");
      } catch {
        setError("Не удалось показать контакты — проверьте соединение и повторите.");
      }
    });
  }

  if (!contacts) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={reveal} disabled={pending} aria-busy={pending}>
          <Eye data-icon="inline-start" />
          {pending ? "Открываем…" : "Показать контакты"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Показ записывается в журнал доступа к персональным данным.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <ul className="space-y-2 text-sm">
        <li className="flex min-w-0 items-center gap-2">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`mailto:${contacts.email}`} className="min-w-0 truncate underline-offset-4 hover:underline">
            {contacts.email || "почта не указана"}
          </a>
        </li>
        <li className="flex min-w-0 items-center gap-2">
          <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {contacts.phone ? (
            <a
              href={`tel:${contacts.phone.replace(/[^\d+]/g, "")}`}
              className="min-w-0 truncate underline-offset-4 hover:underline"
            >
              {contacts.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">телефон не указан</span>
          )}
        </li>
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => setContacts(null)}>
        <EyeOff data-icon="inline-start" />
        Скрыть
      </Button>
      <p className="text-xs text-muted-foreground">Показ записан в журнал доступа к персональным данным.</p>
    </div>
  );
}
