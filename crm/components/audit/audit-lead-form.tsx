"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  submitAuditAction,
  type AuditLeadState,
} from "@/app/(marketing)/audit/actions";
import { ConsentFields } from "@/components/marketing/consent-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_SCORE } from "@/lib/audit/stages";
import type { Answers } from "@/lib/audit/score";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Отправляем…" : "Получить разбор"}
    </Button>
  );
}

/**
 * Заявка по итогам аудита.
 *
 * Полей меньше, чем в форме на лендинге, и это осознанно: человек
 * только что заполнил двенадцать блоков, и просить у него после
 * этого сайт, количество вакансий и подробности значит потерять
 * заявку на последнем шаге. Всё, чего нет в форме, уже видно
 * из результата аудита.
 *
 * Оценки уходят скрытым полем, но серверу они не указ: там они
 * проверяются и пересчитываются заново.
 */
export function AuditLeadForm({
  answers,
  score,
  band,
  weakCount,
}: {
  answers: Answers;
  score: number;
  band: string;
  /** Сколько слабых этапов показано: обещать разбор трёх при 24 из 24 нельзя. */
  weakCount: number;
}) {
  const [state, action] = useActionState<AuditLeadState, FormData>(
    submitAuditAction,
    {},
  );

  if (state.sent) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h3 className="mt-4 text-lg font-medium">Результаты отправлены</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Вернёмся с комментарием в течение рабочего дня. Ответы аудита
          остались в этом браузере, страницу можно закрыть.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border bg-card p-6 md:p-8">
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <h3 className="text-xl font-medium tracking-tight text-balance">
        {weakCount > 0
          ? "Получите экспертный комментарий по вашим слабым точкам"
          : "Получите комментарий по скорости и конверсии воронки"}
      </h3>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
        {weakCount > 0 ? (
          <>
            Разберём {weakCount === 1 ? "ваш слабый этап" : `ваши ${weakCount} слабых этапа`}: почему
            он проседает и что делать именно в вашем случае. Бесплатно
            и без созвона, если созвон вам не нужен.
          </>
        ) : (
          <>
            Наличие процессов вы уже проверили. Посмотрим на другое: сколько
            стоит закрытие, где проседает конверсия и как быстро вы проходите
            путь от заявки до выхода. Бесплатно и без созвона, если созвон
            вам не нужен.
          </>
        )}
      </p>

      <div className="mt-5 rounded-lg bg-secondary px-4 py-3 text-sm">
        К заявке приложим ваш результат:{" "}
        <span className="font-medium tabular-nums">
          {score} из {MAX_SCORE}
        </span>
        , {band.toLowerCase()}.
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="audit-name">Ваше имя</Label>
          <Input id="audit-name" name="name" required autoComplete="name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-company">
            Компания{" "}
            <span className="font-normal text-muted-foreground">
              необязательно
            </span>
          </Label>
          <Input
            id="audit-company"
            name="company"
            autoComplete="organization"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="audit-contact">Телефон, Telegram или почта</Label>
          <Input id="audit-contact" name="contact" required />
          <p className="text-xs text-muted-foreground">
            Напишите, как вам удобнее. Ответим тем же каналом.
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="audit-note">
            Что важно учесть{" "}
            <span className="font-normal text-muted-foreground">
              необязательно
            </span>
          </Label>
          <Textarea
            id="audit-note"
            name="note"
            rows={3}
            placeholder="Например: какую позицию сейчас закрываете и что уже пробовали"
          />
        </div>
      </div>

      <ConsentFields idPrefix="audit" />

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
