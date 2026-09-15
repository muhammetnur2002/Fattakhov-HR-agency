"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { AreaField, SelectField, TextField } from "./wizard-fields";
import {
  saveDraftAction,
  submitVacancyAction,
} from "@/app/actions/vacancies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EMPLOYMENT_TYPE_LABELS,
  URGENCY_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export type WizardValues = Record<string, string>;

export type HiringManager = { id: string; fullName: string };

export type ClientOption = { id: string; name: string };

const STEPS = [
  { n: 1, title: "Позиция" },
  { n: 2, title: "Требования" },
  { n: 3, title: "Условия" },
  { n: 4, title: "Процесс" },
  { n: 5, title: "Проверка" },
];

/** Интервал автосохранения (BR-20). */
const AUTOSAVE_MS = 10_000;

const EMPTY: WizardValues = {
  title: "",
  department: "",
  hiringManagerId: "",
  headcount: "1",
  reasonForHire: "",
  urgency: "NORMAL",
  desiredStartDate: "",
  responsibilities: "",
  requirements: "",
  niceToHave: "",
  stopFactors: "",
  targetCompanies: "",
  salaryFrom: "",
  salaryTo: "",
  salaryGross: "true",
  bonusScheme: "",
  city: "",
  workFormat: "",
  employmentType: "",
  workSchedule: "",
  conditions: "",
  interviewStages: "",
};

/**
 * Мастер заявки на подбор.
 *
 * Один и тот же на обе стороны. Клиент заводит заявку сам, агентство
 * заводит её за клиента, когда тот продиктовал вакансию голосом или
 * прислал письмом. Второй копии мастера быть не должно: бриф это самое
 * длинное место в продукте, и разъехавшиеся копии разойдутся по полям
 * в первый же месяц.
 *
 * Отличий ровно два: выбор клиента в начале и адрес, куда уводит после
 * отправки.
 */
export function VacancyWizard({
  hiringManagers,
  initialValues,
  initialVacancyId,
  clients,
  initialClientId,
  hrefBase = "/vacancies",
}: {
  hiringManagers: HiringManager[];
  initialValues?: Partial<WizardValues>;
  initialVacancyId?: string;
  /** Задан только для агентства: клиенту выбирать нечего. */
  clients?: ClientOption[];
  initialClientId?: string;
  hrefBase?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(
    initialClientId ?? (clients?.length === 1 ? clients[0].id : ""),
  );

  /**
   * Смена компании перезагружает страницу с новым адресом.
   *
   * Список нанимающих менеджеров приходит с сервера и зависит от
   * компании. Тянуть его отдельным запросом ради экрана, который
   * открывают раз в неделю, незачем: проще попросить сервер собрать
   * страницу заново. Черновика на этот момент ещё нет, терять нечего.
   */
  function pickClient(next: string) {
    setClientId(next);
    router.replace(next ? `?clientId=${encodeURIComponent(next)}` : "?");
  }
  const [step, setStep] = useState(1);
  // Незаданные ключи из initialValues пропускаем, иначе они затрут значения
  // по умолчанию (например, urgency) на undefined
  const [values, setValues] = useState<WizardValues>(() => {
    const merged: WizardValues = { ...EMPTY };
    for (const [key, value] of Object.entries(initialValues ?? {})) {
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  });
  const [vacancyId, setVacancyId] = useState(initialVacancyId);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Черновик сохраняется, только если с прошлого раза что-то изменилось —
  // иначе таймер будет молотить в базу на открытой вкладке
  const dirty = useRef(false);
  const saving = useRef(false);

  const set = useCallback((key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    dirty.current = true;
  }, []);

  const save = useCallback(async () => {
    if (saving.current || !dirty.current) return;
    if (!values.title.trim()) return; // без названия сохранять нечего

    saving.current = true;
    const result = await saveDraftAction(values, vacancyId, clientId);
    saving.current = false;

    if (result.error) {
      setError(result.error);
      return;
    }
    dirty.current = false;
    setError(null);
    if (result.vacancyId && !vacancyId) setVacancyId(result.vacancyId);
    if (result.savedAt) setSavedAt(result.savedAt);
  }, [values, vacancyId, clientId]);

  useEffect(() => {
    const t = setInterval(save, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [save]);

  function goTo(next: number) {
    if (next > step && !validateStep(step, values, setError)) return;
    setError(null);
    void save();
    setStep(next);
  }

  function submit() {
    if (clients && !clientId) {
      setError("Выберите клиента");
      return;
    }
    if (!vacancyId) {
      setError("Черновик ещё не сохранён — подождите пару секунд");
      return;
    }
    startTransition(async () => {
      const result = await submitVacancyAction(vacancyId, values, clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`${hrefBase}/${vacancyId}`);
    });
  }

  return (
    <div className="space-y-6">
      {/* Выбор клиента стоит до шагов, а не внутри первого: он относится
          ко всей заявке, и менять его на середине брифа нельзя, иначе
          черновик уже сохранён не тому */}
      {clients &&
        (vacancyId ? (
          // Черновик уже создан на конкретную компанию: смена клиента
          // здесь означала бы, что сохранённая заявка уедет к другому.
          // Поэтому просто показываем, кому она принадлежит
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Клиент</div>
              <div className="mt-1 font-medium">
                {clients.find((c) => c.id === clientId)?.name ?? "Не выбран"}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Черновик сохранён на эту компанию. Нужна другая, начните новую
                заявку.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <SelectField
                id="wizard-client"
                label="Клиент"
                value={clientId}
                onChange={pickClient}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                emptyLabel="Выберите компанию"
                hint="Заявка заводится от имени этой компании. Клиент увидит её в своём кабинете."
              />
            </CardContent>
          </Card>
        ))}

      <StepBar step={step} onSelect={(n) => goTo(n)} />

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 1 && (
            <Step1 values={values} set={set} hiringManagers={hiringManagers} />
          )}
          {step === 2 && <Step2 values={values} set={set} />}
          {step === 3 && <Step3 values={values} set={set} />}
          {step === 4 && <Step4 values={values} set={set} />}
          {step === 5 && <Preview values={values} managers={hiringManagers} />}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step > 1 && (
          <Button variant="outline" onClick={() => goTo(step - 1)}>
            Назад
          </Button>
        )}
        {step < 5 ? (
          <Button onClick={() => goTo(step + 1)}>Далее</Button>
        ) : (
          <Button onClick={submit} disabled={pending} size="lg">
            {pending ? "Отправляем…" : "Отправить в работу"}
          </Button>
        )}

        <span className="text-xs text-muted-foreground">
          {savedAt
            ? `Черновик сохранён в ${new Date(savedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
            : "Черновик сохранится автоматически"}
        </span>
      </div>
    </div>
  );
}

function StepBar({
  step,
  onSelect,
}: {
  step: number;
  onSelect: (n: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((s) => (
        <li key={s.n}>
          <button
            type="button"
            onClick={() => s.n < step && onSelect(s.n)}
            disabled={s.n > step}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              s.n === step && "bg-primary text-primary-foreground",
              s.n < step && "bg-secondary hover:bg-secondary/80",
              s.n > step && "text-muted-foreground",
            )}
          >
            {s.n}. {s.title}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Проверки, которые нельзя пропустить, двигаясь вперёд. */
function validateStep(
  step: number,
  v: WizardValues,
  setError: (s: string) => void,
): boolean {
  if (step === 1 && v.title.trim().length < 3) {
    setError("Укажите название позиции");
    return false;
  }
  if (step === 3 && v.salaryFrom && v.salaryTo) {
    if (Number(v.salaryFrom) > Number(v.salaryTo)) {
      setError("Нижняя граница вилки больше верхней");
      return false;
    }
  }
  return true;
}

type StepProps = {
  values: WizardValues;
  set: (k: string, v: string) => void;
};

function Step1({
  values,
  set,
  hiringManagers,
}: StepProps & { hiringManagers: HiringManager[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        id="title"
        label="Название позиции"
        required
        className="sm:col-span-2"
        value={values.title}
        onChange={(v) => set("title", v)}
        placeholder="Руководитель отдела продаж"
        hint="Как позиция называется у вас внутри — рекрутер переведёт это в язык рынка"
      />
      <TextField
        id="department"
        label="Подразделение"
        value={values.department}
        onChange={(v) => set("department", v)}
      />
      <SelectField
        id="hiringManagerId"
        label="Заказчик со стороны компании"
        value={values.hiringManagerId}
        onChange={(v) => set("hiringManagerId", v)}
        emptyLabel="Не выбран"
        options={hiringManagers.map((m) => ({
          value: m.id,
          label: m.fullName,
        }))}
        hint={
          // Список пуст почти всегда у первого пользователя компании —
          // без объяснения непонятно, что это вообще решаемо, а не так
          // и задумано
          hiringManagers.length === 0
            ? "Здесь появятся коллеги, которых пригласит ваш менеджер в агентстве — обратитесь к нему, чтобы добавить кого-то"
            : "Он будет видеть эту вакансию и принимать решения по кандидатам"
        }
      />
      <TextField
        id="headcount"
        label="Сколько человек нужно"
        type="number"
        value={values.headcount}
        onChange={(v) => set("headcount", v)}
      />
      <SelectField
        id="urgency"
        label="Срочность"
        value={values.urgency}
        onChange={(v) => set("urgency", v)}
        options={Object.entries(URGENCY_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <TextField
        id="desiredStartDate"
        label="Желаемая дата выхода"
        type="date"
        value={values.desiredStartDate}
        onChange={(v) => set("desiredStartDate", v)}
      />
      <AreaField
        id="reasonForHire"
        label="Почему открыта вакансия"
        rows={3}
        value={values.reasonForHire}
        onChange={(v) => set("reasonForHire", v)}
        placeholder="Рост команды / замена ушедшего / новая функция"
        hint="Помогает объяснить кандидату, зачем его зовут — на это смотрят"
      />
    </div>
  );
}

function Step2({ values, set }: StepProps) {
  return (
    <div className="space-y-5">
      <AreaField
        id="responsibilities"
        label="Обязанности"
        required
        value={values.responsibilities}
        onChange={(v) => set("responsibilities", v)}
        placeholder="Что человек будет делать каждый день"
        hint="Конкретика важнее полноты: пять реальных задач лучше двадцати общих формулировок"
      />
      <AreaField
        id="requirements"
        label="Требования"
        required
        value={values.requirements}
        onChange={(v) => set("requirements", v)}
        placeholder="Без чего кандидата точно не возьмёте"
        hint="Только то, без чего откажете. Всё остальное — в поле ниже"
      />
      <AreaField
        id="niceToHave"
        label="Будет плюсом"
        rows={3}
        value={values.niceToHave}
        onChange={(v) => set("niceToHave", v)}
      />
      <AreaField
        id="stopFactors"
        label="Стоп-факторы"
        rows={3}
        value={values.stopFactors}
        onChange={(v) => set("stopFactors", v)}
        placeholder="Частая смена работы, отсутствие опыта в B2B…"
        hint="Кого точно не рассматривать. Экономит время всем"
      />
      <AreaField
        id="targetCompanies"
        label="Откуда искать"
        rows={3}
        value={values.targetCompanies}
        onChange={(v) => set("targetCompanies", v)}
        placeholder="Конкуренты, смежные отрасли, конкретные компании"
        hint="Даже пара названий сильно ускоряет поиск"
      />
    </div>
  );
}

function Step3({ values, set }: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        id="salaryFrom"
        label="Вилка от, ₽"
        type="number"
        value={values.salaryFrom}
        onChange={(v) => set("salaryFrom", v)}
      />
      <TextField
        id="salaryTo"
        label="Вилка до, ₽"
        type="number"
        value={values.salaryTo}
        onChange={(v) => set("salaryTo", v)}
      />
      <SelectField
        id="salaryGross"
        label="Вилка указана"
        value={values.salaryGross}
        onChange={(v) => set("salaryGross", v)}
        options={[
          { value: "true", label: "До вычета налога (gross)" },
          { value: "false", label: "На руки (net)" },
        ]}
      />
      <TextField
        id="city"
        label="Город"
        value={values.city}
        onChange={(v) => set("city", v)}
      />
      <SelectField
        id="workFormat"
        label="Формат работы"
        value={values.workFormat}
        onChange={(v) => set("workFormat", v)}
        emptyLabel="Не указан"
        options={Object.entries(WORK_FORMAT_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <SelectField
        id="employmentType"
        label="Тип занятости"
        value={values.employmentType}
        onChange={(v) => set("employmentType", v)}
        emptyLabel="Не указан"
        options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(
          ([value, label]) => ({ value, label }),
        )}
      />
      <TextField
        id="workSchedule"
        label="График"
        className="sm:col-span-2"
        value={values.workSchedule}
        onChange={(v) => set("workSchedule", v)}
        placeholder="5/2, 09:00–18:00"
      />
      <AreaField
        id="bonusScheme"
        label="Бонусная схема"
        rows={3}
        value={values.bonusScheme}
        onChange={(v) => set("bonusScheme", v)}
        placeholder="Квартальный бонус до 30% от оклада при выполнении плана"
      />
      <AreaField
        id="conditions"
        label="Что предлагаете"
        rows={3}
        value={values.conditions}
        onChange={(v) => set("conditions", v)}
        placeholder="ДМС, обучение, гибкое начало дня, оплата спорта"
        hint="Этим рекрутер продаёт вакансию кандидату"
      />
    </div>
  );
}

function Step4({ values, set }: StepProps) {
  return (
    <AreaField
      id="interviewStages"
      label="Как выглядит отбор у вас"
      rows={6}
      value={values.interviewStages}
      onChange={(v) => set("interviewStages", v)}
      placeholder={"1. Интервью с HR, 30 минут\n2. Встреча с руководителем\n3. Тестовое задание\n4. Финал с директором"}
      hint="Кандидату важно понимать, сколько встреч впереди. Заодно мы подстроим под это воронку"
    />
  );
}

function Preview({
  values,
  managers,
}: {
  values: WizardValues;
  managers: HiringManager[];
}) {
  const manager = managers.find((m) => m.id === values.hiringManagerId);
  const salary =
    values.salaryFrom || values.salaryTo
      ? `${values.salaryFrom || "…"} – ${values.salaryTo || "…"} ₽ ${values.salaryGross === "true" ? "gross" : "на руки"}`
      : "Не указана";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{values.title || "Без названия"}</h3>
        <p className="text-sm text-muted-foreground">
          Проверьте бриф — после отправки правки идут через обсуждение
          с рекрутером.
        </p>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Row label="Подразделение">{values.department || "—"}</Row>
        <Row label="Заказчик">{manager?.fullName ?? "—"}</Row>
        <Row label="Человек нужно">{values.headcount}</Row>
        <Row label="Срочность">
          {URGENCY_LABELS[values.urgency as keyof typeof URGENCY_LABELS]}
        </Row>
        <Row label="Вилка">{salary}</Row>
        <Row label="Город">{values.city || "—"}</Row>
        <Row label="Обязанности" wide>
          {values.responsibilities || "— не заполнено"}
        </Row>
        <Row label="Требования" wide>
          {values.requirements || "— не заполнено"}
        </Row>
        {values.stopFactors && (
          <Row label="Стоп-факторы" wide>
            {values.stopFactors}
          </Row>
        )}
        {values.interviewStages && (
          <Row label="Процесс отбора" wide>
            {values.interviewStages}
          </Row>
        )}
      </dl>
    </div>
  );
}

function Row({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}
