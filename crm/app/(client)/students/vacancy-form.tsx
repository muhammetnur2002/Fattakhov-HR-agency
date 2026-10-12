"use client";

import { useRef, useState } from "react";

import { ImagePlus, Trash2 } from "lucide-react";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldSet } from "@/components/ui/field";
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
import { useFormAction } from "@/lib/hooks/use-form-action";
import type { VacancyDetail, VacancyFields } from "@/lib/students-service";
import { studentsFileProxyUrl } from "@/lib/students-file-url";
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

/** Больше Vercel не пропускает в одном запросе (4,5 МБ) — файл побольше не дойдёт, поэтому предупреждаем сразу. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Сколько фото у вакансии максимум — как на платформе (VACANCY_LIMITS.photos). */
const MAX_PHOTOS = 6;

/**
 * Фото вакансии: логотип, фирменная картинка, офис. Первое — обложка: оно ложится в шапку
 * карточки в ленте студентов и плавно растворяется вниз, остальные видны в подробностях.
 * Файл уходит на платформу сразу при выборе, а с вакансией сохраняются только адреса.
 */
export function PhotosField({ initialPhotos }: { initialPhotos: string[] }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (photos.length >= MAX_PHOTOS) {
          setError(`Не больше ${MAX_PHOTOS} фото`);
          break;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setError(`«${file.name}» больше 4 МБ — уменьшите картинку`);
          continue;
        }
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/students-vacancy-cover", { method: "POST", body });
        const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!response.ok || !data.url) {
          setError(data.error ?? "Не удалось загрузить картинку");
          continue;
        }
        const url = data.url;
        setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, url]));
      }
    } catch {
      setError("Нет связи — попробуйте ещё раз");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const makeCover = (index: number) =>
    setPhotos((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
  const remove = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Фото</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {photos.map((url) => (
          <input key={url} type="hidden" name="photo" value={url} />
        ))}

        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((url, index) => (
              <li key={url} className="space-y-1.5">
                <div className="relative aspect-[5/3] overflow-hidden rounded-xl border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- файл с платформы через прокси, размеры заранее неизвестны */}
                  <img src={studentsFileProxyUrl(url)} alt={index === 0 ? "Обложка вакансии" : "Фото вакансии"} className="size-full object-cover" />
                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-medium">
                      Обложка
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {index !== 0 && (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => makeCover(index)}>
                      Сделать обложкой
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(index)}>
                    <Trash2 className="mr-1 size-4" aria-hidden />
                    Убрать
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy}
            disabled={photos.length >= MAX_PHOTOS}
            onClick={() => input.current?.click()}
          >
            {!busy && <ImagePlus className="mr-1 size-4" aria-hidden />}
            {busy ? "Загружаем…" : photos.length === 0 ? "Добавить фото" : "Добавить ещё"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Логотип, фирменная картинка, офис — до {MAX_PHOTOS} штук. Первое фото станет обложкой карточки в ленте
            студентов. JPG, PNG или WebP до 4 МБ.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Файлы фото"
          onChange={(event) => void upload(event.target.files)}
        />
        <FormMessage compact error={error} className="text-sm" />
      </CardContent>
    </Card>
  );
}

/**
 * Две кнопки в одной форме: индикатор и «идёт» — только у нажатой (`pressed` — её значение),
 * вторая просто блокируется. Форма уходит вручную, `useFormStatus` её не видит, поэтому
 * состояние приходит снаружи.
 */
function SubmitButtons({
  submitLabel,
  pending,
  pressed,
}: {
  submitLabel: string;
  pending: boolean;
  pressed: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <SubmitButton
        name="submit"
        value="false"
        variant="outline"
        loading={pending && pressed === "false"}
        disabled={pending}
        pendingLabel="Сохраняем…"
      >
        Сохранить черновик
      </SubmitButton>
      <SubmitButton
        name="submit"
        value="true"
        loading={pending && pressed === "true"}
        disabled={pending}
        pendingLabel="Отправляем…"
      >
        {submitLabel}
      </SubmitButton>
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
  // Отправка через useFormAction, а не через action формы: React 19 после action очищает все
  // поля формы, и при любой ошибке («заполните ИНН», «выберите день») клиент терял бы
  // всё, что успел ввести. Фокус после отказа уходит на первое неверное поле
  const { state, pending, formProps } = useFormAction<VacancyFormState>(action, {});
  // Какая из двух кнопок нажата — чтобы индикатор крутился на ней, а не на обеих
  const [pressed, setPressed] = useState<string | null>(null);
  const errors = state.fields ?? fieldErrors ?? {};

  return (
    <form
      {...formProps}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        setPressed(submitter?.getAttribute("value") ?? null);
        formProps.onSubmit(event);
      }}
      className="space-y-6"
    >
      <PhotosField initialPhotos={initial?.photos ?? []} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Должность" error={errors.title}>
            <Input id="title" name="title" defaultValue={initial?.title} required />
          </Field>
          <Field label="Описание" error={errors.summary}>
            <Textarea id="summary" name="summary" rows={4} defaultValue={initial?.summary} required />
          </Field>
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
            <Field label="Оплата от" error={errors.salaryFrom}>
              <Input id="salaryFrom" name="salaryFrom" type="number" min={0} defaultValue={initial?.salaryFrom ?? ""} />
            </Field>
            <Field label="Оплата до" error={errors.salaryTo}>
              <Input id="salaryTo" name="salaryTo" type="number" min={0} defaultValue={initial?.salaryTo ?? ""} />
            </Field>
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
            <Field label="Город" className="sm:col-span-2" error={errors.city}>
              <Input id="city" name="city" defaultValue={initial?.city ?? "Казань"} required />
            </Field>
            {/* min/max подсказывают счётчику; проверка браузера выключена (useFormAction), диапазон 4–60 проверяет
                студенческая платформа, и её отказ приходит в `fields.hoursPerWeek` — ему нужно место под полем */}
            <Field label="Часов в неделю" error={errors.hoursPerWeek}>
              <Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={4} max={60} defaultValue={initial?.hoursPerWeek ?? ""} />
            </Field>
          </div>

          <FieldSet id="shiftDays-group" legend="Дни" error={errors.shiftDays} className="space-y-2">
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox name="shiftDays" value={day} defaultChecked={initial?.shiftDays.includes(day)} />
                  {WEEKDAY_LABEL[day]}
                </label>
              ))}
            </div>
          </FieldSet>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Адрес (улица, дом)"
              className="sm:col-span-2"
              hint="Не нужен для удалённой работы."
              error={errors.address}
            >
              <Input id="address" name="address" defaultValue={initial?.address ?? ""} />
            </Field>
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
            <Input id="videoUrl" name="videoUrl" defaultValue={initial?.videoUrl ?? ""} placeholder="https://" />
            <p className="text-xs text-muted-foreground">
              Ссылка на ролик (YouTube, RuTube, VK Видео). Студенты увидят его в подробностях вакансии.
            </p>
          </div>
        </CardContent>
      </Card>

      <FormMessage error={state.error} />

      <SubmitButtons submitLabel={skipsModeration ? "Опубликовать" : "Отправить на проверку"} pending={pending} pressed={pressed} />
      <p className="text-xs text-muted-foreground">
        {skipsModeration
          ? "По вашему договору вакансия публикуется сразу, без проверки агентством."
          : "Агентство проверит вакансию перед публикацией в ленте студентов."}
      </p>
    </form>
  );
}
