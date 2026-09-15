"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitLeadAction, type LeadState } from "@/app/(marketing)/actions";
import { ConsentFields } from "@/components/marketing/consent-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VACANCY_COUNT_OPTIONS } from "@/lib/validation/lead";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Отправляем…" : "Отправить заявку"}
    </Button>
  );
}

/**
 * Заявка на диагностику.
 *
 * Обязательны имя и контакт, остальное необязательно и помечено словами,
 * а не звёздочками. Каждое обязательное поле на первом касании стоит
 * заявок, а сайт и подробности всё равно спросят на разговоре.
 *
 * Подпись у каждого поля сверху, подсказка под ним. Плейсхолдер вместо
 * подписи не используется: он исчезает при вводе, и человек перестаёт
 * понимать, что заполняет.
 */
export function LeadForm() {
  const [state, action] = useActionState<LeadState, FormData>(
    submitLeadAction,
    {},
  );
  const [vacancies, setVacancies] = useState("");

  if (state.sent) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h3 className="mt-4 text-xl font-medium">Заявка отправлена</h3>
        <p className="mx-auto mt-2 max-w-sm text-base leading-relaxed text-muted-foreground">
          Свяжемся в течение рабочего дня и договоримся о 20 минутах на разбор
          вакансий.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-medium">Расскажите о найме</h3>
        <span className="text-sm text-muted-foreground">около минуты</span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-name">Ваше имя</Label>
          <Input id="lead-name" name="name" required autoComplete="name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lead-company">
            Компания{" "}
            <span className="font-normal text-muted-foreground">
              необязательно
            </span>
          </Label>
          <Input
            id="lead-company"
            name="company"
            autoComplete="organization"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-contact">Телефон, Telegram или почта</Label>
          <Input id="lead-contact" name="contact" required />
          <p className="text-sm text-muted-foreground">
            Напишите, как вам удобнее. Ответим тем же каналом.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lead-website">
            Сайт{" "}
            <span className="font-normal text-muted-foreground">
              необязательно
            </span>
          </Label>
          <Input id="lead-website" name="website" inputMode="url" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lead-vacancies">Сколько вакансий планируете</Label>
          <Select name="vacancies" value={vacancies} onValueChange={setVacancies}>
            <SelectTrigger id="lead-vacancies" className="w-full">
              <SelectValue placeholder="Выберите вариант" />
            </SelectTrigger>
            <SelectContent>
              {VACANCY_COUNT_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-note">
            Что важно учесть{" "}
            <span className="font-normal text-muted-foreground">
              необязательно
            </span>
          </Label>
          <Textarea id="lead-note" name="note" rows={3} />
        </div>
      </div>

      <ConsentFields idPrefix="lead" />

      {state.error && (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <SubmitButton />
      </div>

    </form>
  );
}
