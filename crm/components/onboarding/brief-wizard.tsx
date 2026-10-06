"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { completeBriefAction } from "@/app/(onboarding)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Анкета после регистрации — по одному вопросу на экран.
 *
 * Решение заказчика 24.09.2026 (CRM агентства): «анкету выкладывать не
 * сплошником, а по одному, с мягкой анимацией перехода без обновления
 * страницы».
 * Длинная форма из девяти полей пугает до того, как начнёшь; вопрос
 * за вопросом — это разговор, и каждый шаг заканчивается за секунды.
 *
 * Ответы копятся здесь, в браузере, и уходят разом в конце
 * (completeBriefAction): брошенная на середине анкета не оставляет
 * в базе полкомпании. Чтобы случайное обновление страницы не стирало
 * уже сказанное, черновик лежит в sessionStorage — только этой
 * вкладки и только до её закрытия.
 *
 * После анкеты — сразу в кабинет: условия сотрудничества выбираются
 * там, когда человек будет готов (плашка и замки разделов ведут
 * на /onboarding), анкета к ним не принуждает.
 *
 * Движение — сдвиг на 32px с растворением, 220 мс, в сторону шага:
 * вперёд уходит влево, назад — вправо. При «уменьшить движение»
 * остаётся только растворение (правило components/motion/primitives.tsx).
 */

type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "tel" | "email";
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  placeholder?: string;
};

type Step = {
  key: string;
  question: string;
  hint?: string;
  optional?: boolean;
  fields: FieldDef[];
  validate: (values: Values) => { field: string; message: string } | null;
};

type Values = Record<string, string>;

type Draft = { values: Values; index: number };

/**
 * Черновик анкеты в sessionStorage — через useSyncExternalStore, тот же
 * приём, что у выбора по cookie (lib/analytics/consent.ts).
 *
 * Не useEffect с восстановлением: на сервере хранилища нет, и первая
 * отрисовка обязана совпасть с серверной, а подмена состояния в эффекте
 * — это лишний проход и то самое расхождение. Здесь сервер и первая
 * отрисовка видят «черновика нет», а дальше React сам берёт сохранённое.
 *
 * Копия в памяти — на случай, когда хранилище недоступно (частный режим):
 * тогда черновик живёт до обновления страницы, но анкета работает.
 * Ключ — с id пользователя: в одной вкладке после выхода может
 * зарегистрироваться другой человек, и чужие ответы ему ни к чему.
 */
function draftStore(key: string) {
  const listeners = new Set<() => void>();
  let memory: string | null | undefined;

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): string | null {
      if (memory === undefined) {
        try {
          memory = sessionStorage.getItem(key);
        } catch {
          memory = null;
        }
      }
      return memory;
    },
    write(value: string | null) {
      memory = value;
      try {
        if (value === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, value);
      } catch {
        // Не сохранилось — черновик остаётся в памяти этой страницы
      }
      for (const listener of listeners) listener();
    },
  };
}

const stores = new Map<string, ReturnType<typeof draftStore>>();

function storeFor(userId: string) {
  const key = `fhr-brief-draft:${userId}`;
  let store = stores.get(key);
  if (!store) {
    store = draftStore(key);
    stores.set(key, store);
  }
  return store;
}

function parseDraft(raw: string | null): Partial<Draft> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Partial<Draft>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const serverSnapshot = () => null;

function digits(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function money(value: string | undefined): number | null {
  const d = digits(value);
  return d ? Number(d) : null;
}

function required(key: string, message: string) {
  return (values: Values) =>
    (values[key] ?? "").trim().length >= 2 ? null : { field: key, message };
}

/**
 * Какие вопросы задать.
 *
 * Телефон — только тем, у кого его ещё нет (вошедшим по номеру он уже
 * проверен, зарегистрированные по почте назвали его на первом экране).
 * Почта — только вместо заглушки: у вошедших по телефону
 * её нет, а уведомления уходят на неё.
 * Подписи — из правок формы регистрации: «ФИО», «Ваша должность».
 */
function buildSteps(options: { needsPhone: boolean; needsEmail: boolean }): Step[] {
  const steps: Step[] = [
    {
      key: "company",
      question: "Как называется компания?",
      hint: "Как её знают кандидаты — можно без ООО",
      fields: [{ key: "company", label: "Компания", autoComplete: "organization", placeholder: "Например, Ромашка" }],
      validate: required("company", "Укажите название компании"),
    },
    {
      key: "name",
      question: "Как к вам обращаться?",
      fields: [{ key: "name", label: "ФИО", autoComplete: "name" }],
      validate: required("name", "Укажите ФИО"),
    },
    {
      key: "position",
      question: "Ваша должность",
      hint: "Чтобы агентство знало, с кем говорит",
      optional: true,
      fields: [{ key: "position", label: "Ваша должность", autoComplete: "organization-title", placeholder: "Например, HR-директор" }],
      validate: () => null,
    },
  ];

  if (options.needsPhone) {
    steps.push({
      key: "phone",
      question: "Телефон для связи",
      hint: "Агентство позвонит, чтобы обсудить подбор",
      fields: [{ key: "phone", label: "Телефон", type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+7 900 123-45-67" }],
      validate: (values) => {
        const d = digits(values.phone);
        return d.length === 10 || d.length === 11
          ? null
          : { field: "phone", message: "Проверьте номер: например, +7 900 123-45-67" };
      },
    });
  }

  if (options.needsEmail) {
    steps.push({
      key: "email",
      question: "Рабочая почта",
      hint: "Сюда придут уведомления о кандидатах. Пришлём письмо — адрес подключится, когда вы его подтвердите. Можно указать позже в настройках",
      optional: true,
      fields: [{ key: "email", label: "Почта", type: "email", inputMode: "email", autoComplete: "email", placeholder: "you@company.ru" }],
      validate: (values) => {
        const v = (values.email ?? "").trim();
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
          ? null
          : { field: "email", message: "Проверьте адрес почты" };
      },
    });
  }

  steps.push(
    {
      key: "vacancyTitle",
      question: "Кого ищете?",
      hint: "Одна позиция — остальные заведёте в кабинете",
      fields: [{ key: "vacancyTitle", label: "Должность", placeholder: "Например, руководитель отдела продаж" }],
      validate: required("vacancyTitle", "Напишите, кого ищете"),
    },
    {
      key: "city",
      question: "В каком городе?",
      hint: "Или «удалённо»",
      optional: true,
      fields: [{ key: "city", label: "Город", autoComplete: "address-level2" }],
      validate: () => null,
    },
    {
      key: "salary",
      question: "Какая вилка зарплаты?",
      hint: "До вычета налогов, в месяц. Если ещё не решили — пропустите",
      optional: true,
      fields: [
        { key: "salaryFrom", label: "От, ₽", inputMode: "numeric", placeholder: "150 000" },
        { key: "salaryTo", label: "До, ₽", inputMode: "numeric", placeholder: "200 000" },
      ],
      validate: (values) => {
        const from = money(values.salaryFrom);
        const to = money(values.salaryTo);
        return from !== null && to !== null && from > to
          ? { field: "salaryTo", message: "Нижняя граница больше верхней" }
          : null;
      },
    },
  );

  return steps;
}

export function BriefWizard({
  userId,
  initial,
  needsPhone,
  needsEmail,
}: {
  userId: string;
  /** Что уже известно: имя, если уже известно. */
  initial: Values;
  needsPhone: boolean;
  needsEmail: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const steps = useMemo(() => buildSteps({ needsPhone, needsEmail }), [needsPhone, needsEmail]);

  const store = storeFor(userId);
  const raw = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const draft = useMemo(() => parseDraft(raw), [raw]);

  const values: Values = { ...initial, ...draft.values };
  const index = Math.min(Math.max(draft.index ?? 0, 0), steps.length - 1);

  const [direction, setDirection] = useState(1);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const step = steps[index];
  const last = index === steps.length - 1;

  function save(next: Draft) {
    store.write(JSON.stringify(next));
  }

  function set(key: string, value: string) {
    save({ values: { ...values, [key]: value }, index });
    if (error?.field === key) setError(null);
  }

  function go(to: number, nextValues: Values = values) {
    setDirection(to > index ? 1 : -1);
    setError(null);
    save({ values: nextValues, index: to });
  }

  function submitAll(finalValues: Values = values) {
    startTransition(async () => {
      const result = await completeBriefAction(finalValues);
      if (result.ok) {
        setDone(true);
        store.write(null);
        // replace, а не push: «Назад» из кабинета не должен возвращать
        // к анкете, которую уже не покажут
        router.replace("/dashboard");
        return;
      }
      // Вернуть туда, где исправлять
      const at = steps.findIndex((s) => s.fields.some((f) => f.key === result.field));
      if (at >= 0 && at !== index) go(at, finalValues);
      setError({ field: result.field, message: result.error ?? "Проверьте ответы" });
    });
  }

  function next(event?: React.FormEvent) {
    event?.preventDefault();
    const problem = step.validate(values);
    if (problem) {
      setError(problem);
      return;
    }
    if (last) submitAll();
    else go(index + 1);
  }

  function skip() {
    // Пропуск стирает ответ: иначе «пропустить» отправило бы то,
    // что человек начал вводить и передумал
    const cleared = { ...values };
    for (const f of step.fields) delete cleared[f.key];
    if (last) {
      save({ values: cleared, index });
      submitAll(cleared);
    } else {
      go(index + 1, cleared);
    }
  }

  const shift = reduceMotion ? 0 : 32;
  const progress = done ? 100 : Math.round((index / steps.length) * 100);

  return (
    <Card className="overflow-hidden">
      {/* Прогресс — полоса и слова. Полоса одна не говорит, сколько
          осталось; «3 из 8» говорит */}
      <div
        role="progressbar"
        aria-label="Анкета"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done ? steps.length : index}
        className="h-1 bg-muted"
      >
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <CardContent className="p-6 sm:p-10">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.22 }}
              className="py-6 text-center"
            >
              <p className="text-2xl font-semibold">Спасибо!</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Агентство получило ваши ответы, черновик заявки готов.
                Открываем кабинет…
              </p>
            </motion.div>
          ) : (
            <motion.form
              key={step.key}
              custom={direction}
              initial={{ opacity: 0, x: direction * shift }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -shift }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={next}
              noValidate
              className="space-y-6"
              aria-labelledby={`q-${step.key}`}
            >
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground tabular-nums">
                  Шаг {index + 1} из {steps.length}
                  {step.optional && " · можно пропустить"}
                </p>
                <h2 id={`q-${step.key}`} className="text-2xl leading-tight font-semibold text-balance">
                  {step.question}
                </h2>
                {step.hint && <p className="text-sm text-muted-foreground">{step.hint}</p>}
              </div>

              <div className={cn("grid gap-4", step.fields.length > 1 && "sm:grid-cols-2")}>
                {step.fields.map((field, i) => {
                  const invalid = error?.field === field.key;
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label
                        htmlFor={`f-${field.key}`}
                        // Один вопрос — одно поле: подпись повторила бы
                        // вопрос над ней. Для программ чтения с экрана
                        // оставляем, глазу — только когда полей два
                        className={step.fields.length === 1 ? "sr-only" : undefined}
                      >
                        {field.label}
                      </Label>
                      <Input
                        id={`f-${field.key}`}
                        name={field.key}
                        type={field.type ?? "text"}
                        inputMode={field.inputMode}
                        autoComplete={field.autoComplete}
                        placeholder={field.placeholder}
                        value={values[field.key] ?? ""}
                        onChange={(e) => set(field.key, e.target.value)}
                        // Фокус сразу в поле: вопрос на экране один,
                        // и отвечать на него — единственное действие
                        autoFocus={i === 0}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? "brief-error" : undefined}
                        className="h-11 text-base"
                      />
                    </div>
                  );
                })}
              </div>

              {error && (
                <p id="brief-error" role="alert" className="text-sm text-destructive">
                  {error.message}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => go(index - 1)}
                  disabled={index === 0 || pending}
                  // Место под кнопку держим и на первом шаге — иначе
                  // «Далее» прыгала бы при переходе на второй
                  className={index === 0 ? "invisible" : undefined}
                >
                  Назад
                </Button>
                <div className="flex gap-2">
                  {step.optional && (
                    <Button type="button" variant="outline" onClick={skip} disabled={pending}>
                      Пропустить
                    </Button>
                  )}
                  <Button type="submit" disabled={pending}>
                    {pending ? "Сохраняем…" : last ? "Готово" : "Далее"}
                  </Button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
