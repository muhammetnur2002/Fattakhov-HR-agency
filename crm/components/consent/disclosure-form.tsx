"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  giveDisclosureAction,
  type DisclosureState,
} from "@/app/(public)/disclosure/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PRIVACY_POLICY_PATH } from "@/lib/legal/consent-texts";
import {
  DISCLOSURE_CONSENT_CHECKBOX_LABEL,
  DISCLOSURE_CONTACT_MODE_LABELS,
} from "@/lib/legal/disclosure-consent";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Отправляем…" : "Подтверждаю"}
    </Button>
  );
}

/**
 * Подтверждение передачи данных конкретному работодателю (§4.2 согласия).
 *
 * Открывается с телефона, без аккаунта. Три требования документа, каждое
 * видно в разметке:
 *
 *   §1   — кому и по какой вакансии, отдельным блоком наверху. Кандидат
 *          подтверждает передачу конкретному лицу, а не «работодателю»
 *          вообще, поэтому наименование и ИНН показаны до текста.
 *   §4.1 — выбор про контакты. Ни один вариант не отмечен заранее:
 *          в документе это два пустых квадрата, и подставлять за человека
 *          «через агентство» нельзя, даже если так безопаснее.
 *   §8.2 — отдельная незаполненная галочка с текстом из документа.
 */
export function DisclosureForm({
  token,
  candidateName,
  employerName,
  employerInn,
  vacancyTitle,
  text,
}: {
  token: string;
  candidateName: string;
  employerName: string;
  employerInn: string | null;
  vacancyTitle: string;
  text: string;
}) {
  const [state, setState] = useState<DisclosureState>({});
  const [agreed, setAgreed] = useState(false);
  const [contactMode, setContactMode] = useState("");

  async function handleSubmit(formData: FormData) {
    setState(await giveDisclosureAction({}, formData));
  }

  if (state.given) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Спасибо</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Подтверждение получено. Рекрутер представит вашу кандидатуру
            этому работодателю.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <p className="text-sm text-muted-foreground">
        {candidateName}, подтвердите передачу ваших данных работодателю
        по этой вакансии.
      </p>

      {/* Реквизиты до текста: это то, на что человек соглашается */}
      <dl className="space-y-2 rounded-md border p-4 text-sm">
        <div>
          <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
            Работодатель
          </dt>
          <dd className="font-medium">{employerName}</dd>
        </div>
        {employerInn && (
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
              ИНН
            </dt>
            <dd className="tabular-nums">{employerInn}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
            Вакансия
          </dt>
          <dd className="font-medium">{vacancyTitle}</dd>
        </div>
      </dl>

      <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm whitespace-pre-line">
        {text}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Ваши контактные данные</legend>
        {(
          Object.entries(DISCLOSURE_CONTACT_MODE_LABELS) as [
            keyof typeof DISCLOSURE_CONTACT_MODE_LABELS,
            string,
          ][]
        ).map(([value, label]) => (
          <label key={value} className="flex items-start gap-3 text-sm">
            <input
              type="radio"
              name="contactMode"
              value={value}
              checked={contactMode === value}
              onChange={(e) => setContactMode(e.target.value)}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>
          {DISCLOSURE_CONSENT_CHECKBOX_LABEL}{" "}
          <Link
            href={PRIVACY_POLICY_PATH}
            target="_blank"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Политика в отношении обработки персональных данных
          </Link>
          .
        </span>
      </label>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />

      <p className="text-xs text-muted-foreground">
        Подтверждение действует до завершения рассмотрения вашей
        кандидатуры, но не более 90 дней. Отозвать его можно в любой
        момент — напишите на privacy@fattakhovhr.ru.
      </p>
    </form>
  );
}
