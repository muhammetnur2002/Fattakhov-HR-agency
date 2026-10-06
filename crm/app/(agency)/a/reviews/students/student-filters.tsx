import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  countActiveFilters,
  STUDENT_GENDER_OPTIONS,
  STUDENT_ONLINE_OPTIONS,
  STUDENT_SORT_LABELS,
  STUDENT_SORTS,
  STUDENT_STATUS_OPTIONS,
  STUDENT_STUDY_OPTIONS,
  type StudentSearchParams,
} from "@/lib/students-search-params";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover";

function Field({
  label,
  htmlFor,
  children,
  wide = false,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  /** Текстовые поля на телефоне занимают всю строку, короткие — по два в ряд */
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 space-y-1${wide ? " col-span-2 sm:col-span-1" : ""}`}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Options({ options }: { options: readonly { value: string; label: string }[] }) {
  return (
    <>
      <option value="">Любой</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

/**
 * Поиск и фильтры — обычная форма с GET: отправка складывает условия в адрес
 * страницы, и выборкой можно поделиться ссылкой. Без скриптов, поэтому работает
 * и до загрузки страницы. На телефоне панель фильтров сворачивается (флажок-
 * переключатель на CSS), на широком экране видна всегда.
 */
export function StudentFilters({
  params,
  institutions,
}: {
  params: StudentSearchParams;
  institutions: string[];
}) {
  // Поисковая строка — отдельно от панели: в счётчик «Фильтры · N» она не входит
  const active = countActiveFilters(params) - (params.q ? 1 : 0);

  return (
    <form method="get" action="/a/reviews/students" className="space-y-3" role="search">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Фамилия, имя, вуз, навык…"
            aria-label="Поиск по студентам"
            maxLength={100}
            className="pl-8"
          />
        </div>
        <Button type="submit">Найти</Button>
      </div>

      <div>
        <input
          id="student-filters-toggle"
          type="checkbox"
          className="peer sr-only"
          defaultChecked={active > 0}
        />
        <label
          htmlFor="student-filters-toggle"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm select-none peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 md:hidden"
        >
          Фильтры{active > 0 ? ` · ${active}` : ""}
        </label>
        <div className="mt-3 hidden grid-cols-2 gap-3 peer-checked:grid md:mt-0 md:grid lg:grid-cols-4">
          <Field label="Вуз" htmlFor="sf-university" wide>
            <Input
              id="sf-university"
              name="university"
              defaultValue={params.university ?? ""}
              list="student-institutions"
              placeholder="Любой"
              maxLength={100}
            />
            {institutions.length > 0 && (
              <datalist id="student-institutions">
                {institutions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </Field>
          <Field label="Специальность" htmlFor="sf-speciality" wide>
            <Input
              id="sf-speciality"
              name="speciality"
              defaultValue={params.speciality ?? ""}
              placeholder="Любая"
              maxLength={100}
            />
          </Field>
          <Field label="Курс" htmlFor="sf-year">
            <select id="sf-year" name="studyYear" defaultValue={params.studyYear ?? ""} className={SELECT_CLASS}>
              <option value="">Любой</option>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  {y} курс
                </option>
              ))}
            </select>
          </Field>
          <Field label="Город" htmlFor="sf-city">
            <Input id="sf-city" name="city" defaultValue={params.city ?? ""} placeholder="Любой" maxLength={80} />
          </Field>
          <Field label="Возраст от" htmlFor="sf-age-from">
            <Input
              id="sf-age-from"
              name="ageFrom"
              type="number"
              inputMode="numeric"
              min={14}
              max={99}
              defaultValue={params.ageFrom ?? ""}
              placeholder="18"
            />
          </Field>
          <Field label="Возраст до" htmlFor="sf-age-to">
            <Input
              id="sf-age-to"
              name="ageTo"
              type="number"
              inputMode="numeric"
              min={14}
              max={99}
              defaultValue={params.ageTo ?? ""}
              placeholder="30"
            />
          </Field>
          <Field label="Пол" htmlFor="sf-gender">
            <select id="sf-gender" name="gender" defaultValue={params.gender ?? ""} className={SELECT_CLASS}>
              <Options options={STUDENT_GENDER_OPTIONS} />
            </select>
          </Field>
          <Field label="Навыки (через запятую)" htmlFor="sf-skills" wide>
            <Input
              id="sf-skills"
              name="skills"
              defaultValue={params.skills ?? ""}
              placeholder="Excel, SMM"
              maxLength={300}
            />
          </Field>
          <Field label="Учёба" htmlFor="sf-study">
            <select id="sf-study" name="study" defaultValue={params.study ?? ""} className={SELECT_CLASS}>
              <Options options={STUDENT_STUDY_OPTIONS} />
            </select>
          </Field>
          <Field label="Статус" htmlFor="sf-status">
            <select id="sf-status" name="status" defaultValue={params.status ?? ""} className={SELECT_CLASS}>
              <Options options={STUDENT_STATUS_OPTIONS} />
            </select>
          </Field>
          <Field label="В сети" htmlFor="sf-online">
            <select
              id="sf-online"
              name="onlineWithin"
              defaultValue={params.onlineWithin ?? ""}
              className={SELECT_CLASS}
            >
              <Options options={STUDENT_ONLINE_OPTIONS} />
            </select>
          </Field>
          <Field label="Сортировка" htmlFor="sf-sort">
            <select id="sf-sort" name="sort" defaultValue={params.sort ?? "new"} className={SELECT_CLASS}>
              {STUDENT_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {STUDENT_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2 flex items-end gap-2 lg:col-span-4">
            <Button type="submit">Применить</Button>
            {(active > 0 || params.q) && (
              <Button asChild variant="ghost">
                <Link href="/a/reviews/students">Сбросить</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
