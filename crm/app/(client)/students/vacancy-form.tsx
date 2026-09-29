"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { VacancyDetail, VacancyFields } from "@/lib/students-service";
import type { VacancyFormState } from "./actions";

const WORK_FORMAT_LABEL: Record<VacancyFields["workFormat"], string> = {
  ONSITE: "В офисе",
  HYBRID: "Гибрид",
  REMOTE: "Удалённо",
};

const EMPLOYMENT_TYPE_LABEL: Record<VacancyFields["employmentType"], string> = {
  PART_TIME: "Подработка",
  SHIFT: "Сменный график",
  PROJECT: "Проект",
  INTERNSHIP: "Стажировка",
  FULL_TIME: "Полный день",
};

const SALARY_PERIOD_LABEL: Record<VacancyFields["salaryPeriod"], string> = {
  MONTH: "в месяц",
  SHIFT: "за смену",
  HOUR: "в час",
};

const WEEKDAYS: VacancyFields["shiftDays"][number][] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = {
  MON: "Пн",
  TUE: "Вт",
  WED: "Ср",
  THU: "Чт",
  FRI: "Пт",
  SAT: "Сб",
  SUN: "Вс",
};

function SubmitButtons({ submitLabel }: { submitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="submit" value="false" variant="outline" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить черновик"}
      </Button>
      <Button type="submit" name="submit" value="true" disabled={pending}>
        {pending ? "Отправляем…" : submitLabel}
      </Button>
    </div>
  );
}

export function VacancyForm({
  action,
  initial,
  skipsModeration,
  fieldErrors,
}: {
  action: (prev: VacancyFormState, formData: FormData) => Promise<VacancyFormState>;
  initial?: VacancyDetail;
  /** У клиента с действующим договором вакансия публикуется сразу — см. lib/vacancy.ts на платформе. */
  skipsModeration: boolean;
  fieldErrors?: Record<string, string>;
}) {
  const [state, formAction] = useActionState<VacancyFormState, FormData>(action, {});
  const errors = state.fields ?? fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Должность</Label>
            <Input id="title" name="title" defaultValue={initial?.title} required />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Описание</Label>
            <Textarea id="summary" name="summary" rows={4} defaultValue={initial?.summary} required />
            {errors.summary && <p className="text-sm text-destructive">{errors.summary}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="requirements">Требования (по строке на пункт)</Label>
              <Textarea id="requirements" name="requirements" rows={4} defaultValue={initial?.requirements.join("\n")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perks">Что предлагаем (по строке на пункт)</Label>
              <Textarea id="perks" name="perks" rows={4} defaultValue={initial?.perks.join("\n")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="responsibilities">Обязанности (по строке на пункт)</Label>
              <Textarea
                id="responsibilities"
                name="responsibilities"
                rows={3}
                defaultValue={initial?.responsibilities.join("\n")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="learnings">Чему научится (по строке на пункт)</Label>
              <Textarea id="learnings" name="learnings" rows={3} defaultValue={initial?.learnings.join("\n")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team">Команда</Label>
            <Textarea id="team" name="team" rows={2} defaultValue={initial?.team ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Условия</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="salaryFrom">Оплата от</Label>
              <Input id="salaryFrom" name="salaryFrom" type="number" min={0} defaultValue={initial?.salaryFrom ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryTo">Оплата до</Label>
              <Input id="salaryTo" name="salaryTo" type="number" min={0} defaultValue={initial?.salaryTo ?? ""} />
              {errors.salaryTo && <p className="text-sm text-destructive">{errors.salaryTo}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryPeriod">За период</Label>
              <Select name="salaryPeriod" defaultValue={initial?.salaryPeriod ?? "MONTH"}>
                <SelectTrigger id="salaryPeriod" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SALARY_PERIOD_LABEL) as (keyof typeof SALARY_PERIOD_LABEL)[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SALARY_PERIOD_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workFormat">Формат работы</Label>
              <Select name="workFormat" defaultValue={initial?.workFormat ?? "ONSITE"}>
                <SelectTrigger id="workFormat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(WORK_FORMAT_LABEL) as (keyof typeof WORK_FORMAT_LABEL)[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {WORK_FORMAT_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentType">Тип занятости</Label>
              <Select name="employmentType" defaultValue={initial?.employmentType ?? "PART_TIME"}>
                <SelectTrigger id="employmentType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EMPLOYMENT_TYPE_LABEL) as (keyof typeof EMPLOYMENT_TYPE_LABEL)[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {EMPLOYMENT_TYPE_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Город</Label>
              <Input name="city" defaultValue={initial?.city ?? "Казань"} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hoursPerWeek">Часов в неделю</Label>
              <Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={4} max={60} defaultValue={initial?.hoursPerWeek ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Дни</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox name="shiftDays" value={day} defaultChecked={initial?.shiftDays.includes(day)} />
                  {WEEKDAY_LABEL[day]}
                </label>
              ))}
            </div>
            {errors.shiftDays && <p className="text-sm text-destructive">{errors.shiftDays}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Адрес (улица, дом)</Label>
              <Input id="address" name="address" defaultValue={initial?.address ?? ""} />
              {errors.address && <p className="text-sm text-destructive">{errors.address}</p>}
              <p className="text-xs text-muted-foreground">Не нужен для удалённой работы.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressDetails">Этаж, офис</Label>
              <Input id="addressDetails" name="addressDetails" defaultValue={initial?.addressDetails ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">Район</Label>
            <Input id="district" name="district" defaultValue={initial?.district ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Теги (через запятую)</Label>
            <Input id="tags" name="tags" defaultValue={initial?.tags.join(", ")} placeholder="Excel, гибкий график" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="videoUrl">Ссылка на видео (необязательно)</Label>
            <Input id="videoUrl" name="videoUrl" defaultValue={initial?.videoUrl ?? ""} />
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButtons submitLabel={skipsModeration ? "Опубликовать" : "Отправить на проверку"} />
      <p className="text-xs text-muted-foreground">
        {skipsModeration
          ? "По вашему договору вакансия публикуется сразу, без проверки агентством."
          : "Агентство проверит вакансию перед публикацией в ленте студентов."}
      </p>
    </form>
  );
}
