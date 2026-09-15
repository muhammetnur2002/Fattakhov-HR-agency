"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  giveConsentAction,
  type ConsentState,
} from "@/app/(public)/consent/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Отправляем…" : "Согласен"}
    </Button>
  );
}

/**
 * Форма согласия на обработку персональных данных.
 *
 * Открывается с телефона, без аккаунта. Текст показан целиком, а не
 * ссылкой: согласие «с документом по ссылке, которую никто не открыл»
 * плохо выглядит и в суде, и по-человечески.
 */
export function ConsentForm({
  token,
  candidateName,
  organizationName,
  text,
}: {
  token: string;
  candidateName: string;
  organizationName: string;
  text: string;
}) {
  const [state, setState] = useState<ConsentState>({});
  const [agreed, setAgreed] = useState(false);

  async function handleSubmit(formData: FormData) {
    setState(await giveConsentAction({}, formData));
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
            Согласие получено. Рекрутер продолжит работу по вашей
            кандидатуре.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <p className="text-sm text-muted-foreground">
        {candidateName}, для продолжения работы по вашей кандидатуре
        агентству «{organizationName}» нужно ваше согласие.
      </p>

      <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm whitespace-pre-line">
        {text}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>Я прочитал текст выше и даю согласие</span>
      </label>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />

      <p className="text-xs text-muted-foreground">
        Согласие можно отозвать в любой момент — напишите рекрутеру.
      </p>
    </form>
  );
}
