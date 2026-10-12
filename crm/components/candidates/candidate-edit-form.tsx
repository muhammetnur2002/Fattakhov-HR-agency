"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateCandidateProfileAction } from "@/app/(agency)/a/candidates/extras-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaField, TextField } from "@/components/vacancies/wizard-fields";

export type ProfileValues = Record<string, string>;

/**
 * Правка профиля кандидата: все поля на одной странице.
 *
 * Пока у кандидата нет согласия (сорсинг-лид), форма принимает только имя,
 * контакты и ссылку на профиль: остальные поля закрыты и подписаны, почему.
 * Сохранение стирает очищенные поля; в журнал попадают названия изменённых
 * полей без значений.
 */
export function CandidateEditForm({
  candidateId,
  initialValues,
  restricted,
  backHref,
}: {
  candidateId: string;
  initialValues: ProfileValues;
  /** Режим сорсинг-лида: закрытые поля нельзя заполнять. */
  restricted: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const set = (key: string) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setOk(null);
  };

  function save() {
    setError(null);
    setOk(null);
    startSave(async () => {
      const result = await updateCandidateProfileAction(candidateId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOk(result.ok ?? "Сохранено");
      router.refresh();
    });
  }

  const closedHint = restricted
    ? "Недоступно, пока кандидат не дал согласие"
    : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      {restricted && (
        <Alert>
          <AlertDescription>
            Кандидат найден без его участия и ещё не дал согласие. Пока можно хранить только имя,
            контакты и ссылку на профиль, остальные поля закрыты.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Кто это</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField id="fullName" label="Имя и фамилия" value={values.fullName} onChange={set("fullName")} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="phone" label="Телефон" type="tel" value={values.phone} onChange={set("phone")} />
            <TextField id="email" label="Почта" type="email" value={values.email} onChange={set("email")} />
          </div>
          <TextField id="telegram" label="Telegram" value={values.telegram} onChange={set("telegram")} />
        </CardContent>
      </Card>

      <fieldset disabled={restricted} className={restricted ? "opacity-60" : undefined}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Профиль</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="city" label="Город" value={values.city} onChange={set("city")} hint={closedHint} />
              <TextField
                id="totalExperienceYears"
                label="Опыт, лет"
                type="number"
                value={values.totalExperienceYears}
                onChange={set("totalExperienceYears")}
                hint={closedHint}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="currentPosition"
                label="Текущая должность"
                value={values.currentPosition}
                onChange={set("currentPosition")}
                hint={closedHint}
              />
              <TextField
                id="currentCompany"
                label="Компания"
                value={values.currentCompany}
                onChange={set("currentCompany")}
                hint={closedHint}
              />
            </div>
            <TextField
              id="salaryExpectation"
              label="Зарплатные ожидания, ₽"
              type="number"
              value={values.salaryExpectation}
              onChange={set("salaryExpectation")}
              hint={closedHint}
            />
            <TextField
              id="skills"
              label="Навыки"
              value={values.skills}
              onChange={set("skills")}
              hint={closedHint ?? "Через запятую: 1С, ЗУП, налоговая отчётность"}
            />
            <AreaField id="education" label="Образование" rows={3} value={values.education} onChange={set("education")} hint={closedHint} />
            <AreaField
              id="summary"
              label="Заметка рекрутёра"
              rows={4}
              value={values.summary}
              onChange={set("summary")}
              hint={closedHint ?? "Клиент этого не видит"}
            />
          </CardContent>
        </Card>
      </fieldset>

      <FormMessage error={error} ok={ok} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton loading={saving} pendingLabel="Сохраняем…">
          Сохранить
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
          К карточке
        </Button>
      </div>
    </form>
  );
}
