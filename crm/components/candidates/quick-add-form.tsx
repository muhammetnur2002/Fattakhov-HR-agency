"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  checkDuplicatesAction,
  createCandidateAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormAction } from "@/lib/hooks/use-form-action";
import type { DuplicateWarning } from "@/lib/services/candidates";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/labels";
import { SOURCING_LEAD_TTL_DAYS } from "@/lib/sourcing";

function SubmitButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel="Сохраняем…">
      {label}
    </SubmitButtonBase>
  );
}

/**
 * Быстрое добавление кандидата (ТЗ 7.3.5).
 *
 * Только имя, контакты и ссылка на профиль: новый кандидат — сорсинг-лид
 * (lib/services/sourcing.ts), согласия у него ещё нет, а до согласия
 * больше ничего хранить нельзя. Должность, компания, зарплата и резюме
 * появляются после согласия — раньше они были здесь же, и сервис их
 * теперь отклоняет.
 */
export function QuickAddForm({ vacancyId }: { vacancyId?: string }) {
  // Telegram, «откуда» и ссылка на профиль не управляются состоянием, и action формы стирал их
  // после любого отказа; useFormAction набранное оставляет, а ошибку ставит у поля
  const { state, fields, pending, formProps } = useFormAction<CandidateState>(createCandidateAction, {});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);

  // Проверяем на дубликаты по мере ввода, но с задержкой: дёргать сервер
  // на каждое нажатие незачем
  useEffect(() => {
    // Флаг отменяет применение ответа, если поля успели измениться:
    // иначе медленный запрос перезапишет результат более свежего
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (fullName.trim().length < 3 && !phone && !email) {
        if (!cancelled) setDuplicates([]);
        return;
      }

      const found = await checkDuplicatesAction({ fullName, phone, email });
      if (!cancelled) setDuplicates(found);
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fullName, phone, email]);

  return (
    <form {...formProps} className="space-y-4">
      {vacancyId && <input type="hidden" name="vacancyId" value={vacancyId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя и фамилия" required className="sm:col-span-2" error={fields.fullName}>
          <Input
            id="fullName"
            name="fullName"
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>

        <Field label="Телефон" error={fields.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+7 999 123-45-67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label="Почта" error={fields.email}>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Telegram" error={fields.telegram}>
          <Input id="telegram" name="telegram" placeholder="@username" />
        </Field>

        <Field label="Откуда" id="source" error={fields.source}>
          {(control) => (
            <Select name="source" defaultValue="DIRECT_SEARCH">
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* «Студплатформа» ставится только при добавлении студента из раздела «Студенты» */}
                {Object.entries(CANDIDATE_SOURCE_LABELS)
                  .filter(([value]) => value !== "STUDENT_PLATFORM")
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Ссылка на профиль" className="sm:col-span-2" error={fields.sourceDetails}>
          <Input
            id="sourceDetails"
            name="sourceDetails"
            placeholder="hh.ru, LinkedIn, Telegram-канал — где нашли"
          />
        </Field>
      </div>

      <Alert>
        <AlertDescription className="text-sm">
          Пока кандидат не дал согласие, храним только имя, контакты и ссылку
          на профиль — так требует 152-ФЗ, если данные получены не от самого
          человека. Должность, опыт, зарплата и резюме — после согласия.
          Без согласия данные удалятся через {SOURCING_LEAD_TTL_DAYS} дней:
          уведомить человека и получить ссылку на согласие можно в его карточке.
        </AlertDescription>
      </Alert>

      {/* BR-7: показываем не «дубликат», а где человек сейчас в работе */}
      {duplicates.length > 0 && (
        <Alert variant="warning">
          <AlertDescription className="space-y-1">
            <div className="font-medium">Похоже, он уже у нас в работе</div>
            {duplicates.map((d, i) => (
              <div key={`${d.candidateId}-${i}`} className="text-sm">
                <Link
                  href={`/a/candidates/${d.candidateId}`}
                  className="underline underline-offset-2"
                >
                  {d.fullName}
                </Link>{" "}
                — «{d.vacancyTitle}» у клиента {d.clientName}, этап «
                {d.stageName}»
              </div>
            ))}
            <div className="pt-1 text-xs text-muted-foreground">
              Представлять одного человека двум клиентам одновременно —
              плохая идея. Проверьте, прежде чем заводить второй раз.
            </div>
          </AlertDescription>
        </Alert>
      )}

      <FormMessage error={state.error} />

      <SubmitButton
        label={vacancyId ? "Добавить в воронку" : "Добавить в базу"}
        loading={pending}
      />
    </form>
  );
}
