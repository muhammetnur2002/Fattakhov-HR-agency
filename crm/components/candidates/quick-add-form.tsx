"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  checkDuplicatesAction,
  createCandidateAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
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
import type { DuplicateWarning } from "@/lib/services/candidates";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/labels";
import { SOURCING_LEAD_TTL_DAYS } from "@/lib/sourcing";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : label}
    </Button>
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
  const [state, formAction] = useActionState<CandidateState, FormData>(
    createCandidateAction,
    {},
  );

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
    <form action={formAction} className="space-y-5">
      {vacancyId && <input type="hidden" name="vacancyId" value={vacancyId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fullName">Имя и фамилия *</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Телефон</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+7 999 123-45-67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Почта</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telegram">Telegram</Label>
          <Input id="telegram" name="telegram" placeholder="@username" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="source">Откуда</Label>
          <Select name="source" defaultValue="DIRECT_SEARCH">
            <SelectTrigger id="source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CANDIDATE_SOURCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="sourceDetails">Ссылка на профиль</Label>
          <Input
            id="sourceDetails"
            name="sourceDetails"
            placeholder="hh.ru, LinkedIn, Telegram-канал — где нашли"
          />
        </div>
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
        <Alert>
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

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton
        label={vacancyId ? "Добавить в воронку" : "Добавить в базу"}
      />
    </form>
  );
}
