"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateVacancyBriefAction } from "@/app/(agency)/a/vacancies/edit-actions";
import { AreaField, SelectField, TextField } from "@/components/vacancies/wizard-fields";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { noScriptForm } from "@/lib/forms/no-script";
import { EMPLOYMENT_TYPE_LABELS, URGENCY_LABELS, WORK_FORMAT_LABELS } from "@/lib/labels";

export type BriefValues = Record<string, string>;

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Правка брифа сотрудником агентства: все поля на одной странице.
 *
 * Поля те же, что в мастере заявки, но без шагов и автосохранения: вакансия
 * уже существует, правка записывается кнопкой «Сохранить», в журнал
 * попадает кто и что поменял, а клиент получает уведомление.
 */
export function BriefEditForm({
  vacancyId,
  initialValues,
  hiringManagers,
  backHref,
}: {
  vacancyId: string;
  initialValues: BriefValues;
  hiringManagers: { id: string; fullName: string }[];
  backHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BriefValues>(initialValues);
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
      const result = await updateVacancyBriefAction(vacancyId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOk(result.ok ?? "Сохранено");
      router.refresh();
    });
  }

  return (
    <form
      {...noScriptForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Позиция</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField id="title" label="Название позиции" value={values.title} onChange={set("title")} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="department" label="Подразделение" value={values.department} onChange={set("department")} />
            <TextField
              id="headcount"
              label="Сколько человек нужно"
              type="number"
              min={1}
              max={500}
              value={values.headcount}
              onChange={set("headcount")}
            />
          </div>
          <SelectField
            id="hiringManagerId"
            label="Заказчик со стороны клиента"
            value={values.hiringManagerId}
            onChange={set("hiringManagerId")}
            options={hiringManagers.map((m) => ({ value: m.id, label: m.fullName }))}
            emptyLabel="Не выбран"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="urgency"
              label="Срочность"
              value={values.urgency}
              onChange={set("urgency")}
              options={toOptions(URGENCY_LABELS)}
            />
            <TextField
              id="desiredStartDate"
              label="Желаемая дата выхода"
              type="date"
              value={values.desiredStartDate}
              onChange={set("desiredStartDate")}
            />
          </div>
          <TextField id="reasonForHire" label="Причина найма" value={values.reasonForHire} onChange={set("reasonForHire")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Требования</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AreaField id="responsibilities" label="Обязанности" value={values.responsibilities} onChange={set("responsibilities")} />
          <AreaField id="requirements" label="Требования" value={values.requirements} onChange={set("requirements")} />
          <AreaField id="niceToHave" label="Будет плюсом" rows={3} value={values.niceToHave} onChange={set("niceToHave")} />
          <AreaField id="stopFactors" label="Стоп-факторы" rows={3} value={values.stopFactors} onChange={set("stopFactors")} />
          <AreaField
            id="targetCompanies"
            label="Целевые компании"
            rows={3}
            value={values.targetCompanies}
            onChange={set("targetCompanies")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Условия</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField id="salaryFrom" label="Зарплата от, ₽" type="number" value={values.salaryFrom} onChange={set("salaryFrom")} />
            <TextField id="salaryTo" label="Зарплата до, ₽" type="number" value={values.salaryTo} onChange={set("salaryTo")} />
            <SelectField
              id="salaryGross"
              label="Вилка"
              value={values.salaryGross}
              onChange={set("salaryGross")}
              options={[
                { value: "true", label: "до вычета налога" },
                { value: "false", label: "на руки" },
              ]}
            />
          </div>
          <TextField id="bonusScheme" label="Бонусы" value={values.bonusScheme} onChange={set("bonusScheme")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="city" label="Город" value={values.city} onChange={set("city")} />
            <SelectField
              id="workFormat"
              label="Формат работы"
              value={values.workFormat}
              onChange={set("workFormat")}
              options={toOptions(WORK_FORMAT_LABELS)}
              emptyLabel="Не указан"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="employmentType"
              label="Тип занятости"
              value={values.employmentType}
              onChange={set("employmentType")}
              options={toOptions(EMPLOYMENT_TYPE_LABELS)}
              emptyLabel="Не указан"
            />
            <TextField id="workSchedule" label="График" value={values.workSchedule} onChange={set("workSchedule")} />
          </div>
          <AreaField id="conditions" label="Что предлагает работодатель" rows={4} value={values.conditions} onChange={set("conditions")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Процесс</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaField
            id="interviewStages"
            label="Этапы интервью"
            rows={4}
            value={values.interviewStages}
            onChange={set("interviewStages")}
          />
        </CardContent>
      </Card>

      <FormMessage error={error} ok={ok} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton loading={saving} pendingLabel="Сохраняем…">
          Сохранить
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
          К вакансии
        </Button>
      </div>
    </form>
  );
}
