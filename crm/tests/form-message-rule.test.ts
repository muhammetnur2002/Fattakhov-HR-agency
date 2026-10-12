/**
 * Результат формы — один вид и один канал (сверка 11.10.2026, consistency-6, a11y-7, states-1).
 *
 * Было: ошибка формы — плашка `Alert`, голая красная строка под кнопкой (text-xs или text-sm, по-разному)
 * или toast; успех — плашка той же формы, что и ошибка, различавшаяся цветом; набранное в форме
 * стиралось ответом сервера (React 19 очищает неуправляемые поля после любого `action`).
 *
 * Правила:
 * 1. красная строка в форме — только `FormMessage` (внутри формы) или `FieldError` (под полем); голый
 *    `<p className="text-destructive">` — нет. Красным красят и состояния данных («просрочено»), это явный список;
 * 2. плашку `Alert` для результата не собирают руками: `<AlertDescription>{state.error}</AlertDescription>` — это
 *    `FormMessage`. Предупреждение — `Alert variant="warning"`;
 * 3. канал: в форме с полями результат встроенный (`FormMessage`), toast — у кнопок-действий в списках и на доске,
 *    где строка после успеха исчезает вместе с сообщением. Файлы с toast перечислены;
 * 4. форма с полем ввода и серверным действием уходит через `useFormAction`, а не `action={…}`: иначе
 *    набранное теряется. Что пока не переведено — в списке с причиной, список только сокращается;
 * 5. кнопка отправки формы с `useFormAction` получает `loading` (`useFormStatus` такую форму не видит).
 */
import { describe, expect, it } from "vitest";

import { filesMatching, hasClass, jsxTags, jsxTree, read, sources, type JsxNode } from "./helpers/jsx-source";

const FILES = [...sources("app"), ...sources("components")].filter((f) => !f.includes("components/ui/"));

describe("красная строка в форме — только FormMessage или FieldError", () => {
  /** Красным окрашены данные, а не результат отправки формы. Число — сколько таких элементов в файле. */
  const DATA_COLOUR: Record<string, number> = {
    "components/calendar/calendar-day.tsx": 1, // «просрочено» в блоке задачи на сетке дня
    "components/kanban/candidate-card.tsx": 1, // срок ответа клиента вышел
    "components/analytics/funnel-chart.tsx": 1, // потери воронки
    "components/analytics/employee-table.tsx": 1, // просроченные задания сотрудника
    "app/(agency)/a/analytics/page.tsx": 2, // то же в двух таблицах
    "components/finance/invoice-list.tsx": 1, // «Просрочен на N дней»
    "app/(agency)/a/reviews/moderation/moderation-board.tsx": 2, // «не указан ИНН», «описание не заполнено» — состояние данных
    "app/(client)/students/page.tsx": 1, // причина отклонения вакансии модерацией
  };

  it("голых `<p|span|div className=\"text-destructive\">` нет, кроме перечня окрашенных данных", () => {
    const found: Record<string, number> = {};
    for (const file of FILES) {
      const tags = jsxTags(read(file), "p|span|div|dd|dt|h2|h3|li|label|small").filter((t) =>
        hasClass(t.classes, /^text-destructive(\/\d+)?$/),
      );
      if (tags.length > 0) found[file] = tags.length;
    }
    // Лишнее — новая красная строка в обход FormMessage; недостающее — перечень устарел (правку удалили)
    expect(found).toEqual(DATA_COLOUR);
  });

  it("плашка результата не собирается руками: в AlertDescription не лежит {….error} / {….ok}", () => {
    /** Страницы, где Alert — не результат формы, а состояние загрузки или предупреждение. */
    const NOT_A_FORM_RESULT = new Set([
      "app/(client)/students/page.tsx", // студплатформа не ответила
      "app/(client)/students/applications/page.tsx",
      "app/(client)/students/applications/applications-list.tsx",
      "app/(client)/students/candidates/page.tsx",
      "app/(client)/students/candidates/candidates-list.tsx",
      "app/(client)/students/messages/page.tsx",
      "app/(agency)/a/reviews/students/page.tsx",
      "components/settings/push-device.tsx", // «warning» — Alert variant="warning"
      "components/students/student-candidate-panel.tsx", // то же и сбой платформы при чтении переписки
    ]);
    const pattern = /<AlertDescription[^>]*>\s*\{\s*[\w.?]*\b(error|ok|warning|hint)\s*\}\s*<\/AlertDescription>/g;
    const offenders = FILES.filter((f) => !NOT_A_FORM_RESULT.has(f) && pattern.test(read(f)));
    pattern.lastIndex = 0;
    expect(offenders, "результат формы — <FormMessage error={…} ok={…} />").toEqual([]);
  });

  it("FormMessage не выводится в цикле: N ошибок — N срочных объявлений подряд; причины собираются в одну плашку", () => {
    // `role="alert"` на каждом элементе списка: читалка получает десяток assertive-объявлений, и они заглушают друг
    // друга. Поэтому у ошибки поля (`field.tsx`) роли alert нет, а у списка отказов студентов — одна сводка
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      for (const tag of jsxTags(text, "FormMessage")) {
        const before = text.slice(Math.max(0, tag.index - 160), tag.index);
        if (/\.map\(\s*\(?[\w\s,]*\)?\s*=>\s*\(?\s*$/.test(before)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("успех не рисуется абзацем: `{ok && <p>…}` — это FormMessage", () => {
    const pattern = /\{\s*(?:[\w.?]*\.)?ok\s*&&\s*\(?\s*<(?:p|span|div)\b/;
    expect(FILES.filter((f) => pattern.test(read(f)))).toEqual([]);
  });

  it("предупреждение — Alert variant=\"warning\" (треугольник), не красная плашка ошибки", () => {
    // Сверка 11.10.2026: «пересечение с активными воронками» и «платформа сработала частично» были красными
    // плашками ошибки. Это не отказ, действие выполнено или ещё не выполнено по выбору человека.
    expect(read("components/pdn/erase-button.tsx")).toMatch(/<Alert variant="warning">/);
    expect(read("components/students/student-candidate-panel.tsx")).toMatch(/<Alert variant="warning">/);
    expect(read("components/candidates/quick-add-form.tsx")).toMatch(/<Alert variant="warning">/);
    expect(read("components/interviews/interview-section.tsx")).toMatch(/<Alert variant="warning"/);
  });

  it("плашка без variant не говорит словами предупреждения: «накладки», «пересечение», «внимание» — это warning", () => {
    // Перечень выше знает три-четыре файла. Здесь — любая обычная плашка, в тексте которой слова предупреждения
    const WORDS = /накладк|пересечени|предупрежд|внимание|осторожн|не блокируем/i;
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      for (const tag of jsxTags(text, "Alert")) {
        if (/\bvariant=/.test(tag.text)) continue;
        const block = text.slice(tag.index, text.indexOf("</Alert>", tag.index));
        if (WORDS.test(block)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders, "предупреждение — <Alert variant=\"warning\"> (треугольник)").toEqual([]);
  });
});

describe("канал результата: встроенное сообщение в форме, toast — у кнопок в списках", () => {
  /** Файлы, где результат уходит в toast. Причина — после успеха строка или карточка исчезает со страницы. */
  const TOAST_FILES: Record<string, string> = {
    "components/kanban/kanban-board.tsx": "перенос карточки — не форма",
    "app/(agency)/a/leads/lead-actions.tsx": "форма из одних кнопок: заявка уходит из списка «Входящие»",
    "app/(agency)/a/clients/company-actions.tsx": "привязка компании: после успеха строка пропадает",
    "app/(agency)/a/clients/link-requests/link-request-actions.tsx": "заявка на привязку исчезает из очереди",
    "app/(agency)/a/reviews/study/study-board.tsx": "очередь проверки: карточка уходит из очереди",
    "app/(agency)/a/reviews/moderation/moderation-board.tsx": "очередь проверки: карточка уходит из очереди",
  };

  it("toast — только в перечисленных файлах", () => {
    const withToast = FILES.filter((f) => /from "sonner"/.test(read(f))).sort();
    expect(withToast).toEqual(Object.keys(TOAST_FILES).sort());
  });
});

describe("форма с полями не теряет набранное", () => {
  const TEXT_CONTROL = /^(Input|Textarea|AutoGrowTextarea|Select|NativeSelect|SelectTrigger|textarea|select)$/;
  const isTextControl = (n: JsxNode) =>
    TEXT_CONTROL.test(n.name) || (n.name === "input" && !/type=["{](hidden|checkbox|radio|submit|file)/.test(n.text));
  const hasTextControl = (n: JsxNode): boolean => isTextControl(n) || n.children.some(hasTextControl);

  /**
   * Формы с полем ввода, что пока отправляются через `action={…}`. Число — сколько таких форм в файле.
   * Список только сокращается: перевёл форму на useFormAction — убери строку (или уменьши число).
   */
  const STILL_ACTION: Record<string, { count: number; why: string }> = {
    "app/(public)/login/login-form.tsx": { count: 1, why: "вход: после неверного пароля поле очищается намеренно" },
    "app/(public)/forgot/forgot-form.tsx": { count: 1, why: "одна почта, ответ всегда «проверьте почту»" },
    "app/(public)/register/email-registration.tsx": { count: 2, why: "публичная регистрация (зона лендинга): код из письма не хранится" },
    "components/settings/two-factor.tsx": { count: 3, why: "код и пароль 2FA не удерживаются в странице намеренно" },
    "components/audit/audit-lead-form.tsx": { count: 1, why: "публичный сайт, не кабинет" },
    "components/marketing/lead-form.tsx": { count: 1, why: "публичный сайт, не кабинет" },
    "components/schedule/slot-picker.tsx": { count: 2, why: "публичная страница кандидата по ссылке" },
    "components/comments/comment-thread.tsx": { count: 1, why: "текст хранится в состоянии, а не в поле" },
    "components/messages/message-thread.tsx": { count: 1, why: "текст хранится в состоянии, а не в поле" },
    "components/onboarding/tariff-picker.tsx": { count: 1, why: "выбор карточки тарифа, вводить нечего" },
    "components/pdn/erase-button.tsx": { count: 1, why: "слово-подтверждение «удалить»" },
    "components/vacancies/agency-vacancy-actions.tsx": { count: 1, why: "«Взять в работу»: ведущий в скрытом поле" },
    "app/(agency)/a/clients/company-actions.tsx": { count: 1, why: "список компаний + toast" },
    "app/(agency)/a/clients/link-requests/link-request-actions.tsx": { count: 2, why: "список компаний и пояснение отказа; результат — toast" },
    "components/candidates/candidate-files.tsx": { count: 1, why: "не переведено: файл, вид и вакансия (форма сбрасывается вручную)" },
    "components/interviews/interview-section.tsx": { count: 2, why: "не переведено: варианты времени и оценка встречи" },
  };

  it("форма с полем ввода уходит через useFormAction, а не action={…} (кроме перечня с причинами)", () => {
    const found: Record<string, number> = {};
    for (const file of FILES) {
      const tree = jsxTree(read(file));
      const n = tree.filter(
        // `action={`${base}/search`}` — адрес, а не функция: строку React не вызывает, поля она не стирает
        (x) => /^(motion\.)?form$/.test(x.name) && /\baction=\{(?!\s*[`"'])/.test(x.text) && hasTextControl(x),
      ).length;
      if (n > 0) found[file] = n;
    }
    // Строго, а не «не больше»: форму перевели на useFormAction — строку надо убрать, устаревшая запись иначе
    // молча разрешила бы вернуть `action={…}` обратно
    const expected = Object.fromEntries(Object.entries(STILL_ACTION).map(([file, { count }]) => [file, count]));
    expect(found, "форм с action={…} и полями ввода больше или меньше, чем в списке: возьми useFormAction или поправь список").toEqual(expected);
  });

  it("форма, что уходит через formProps, держит кнопку отправки в состоянии загрузки", () => {
    const SUBMITS = /^(SubmitButton|SubmitButtonBase|Submit|SaveButton|DecisionButton)$/;
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      if (!text.includes("formProps")) continue;
      for (const form of jsxTree(text).filter((x) => /^(motion\.)?form$/.test(x.name) && /formProps/.test(x.text))) {
        const walk = (x: JsxNode) => {
          if (SUBMITS.test(x.name) && !/\bloading=/.test(x.text)) {
            offenders.push(`${file}:${x.line} <${x.name}>`);
          }
          x.children.forEach(walk);
        };
        walk(form);
      }
    }
    expect(offenders, "useFormStatus не видит форму с onSubmit: передай loading={pending}").toEqual([]);
  });

  it("ни одна форма с useFormAction не отключает проверку браузера вручную: noValidate ставит хук", () => {
    // noValidate ставит хук (проверяет сервер, текст по-русски у поля); свой атрибут рядом — путаница
    const offenders = FILES.filter((f) => {
      const text = read(f);
      return text.includes("useFormAction") && /\bnoValidate\b/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

describe("пароль и код не уезжают из формы", () => {
  it("тип ответа действия не знает значений полей", () => {
    // Ответ действия — FormState: error, ok, fields. Ни `values`, ни `password` там нет и быть не должно
    const state = read("lib/form-state.ts");
    expect(state).not.toMatch(/\bvalues\??:/);
    expect(state).not.toMatch(/\bpassword\w*\??:/);
  });

  it("ни одно действие не кладёт в error/ok/fields то, что человек ввёл: formData, пароль, код, токен", () => {
    // Тип `Record<string, string>` пропускает любое значение, поэтому смотрим на сами ответы действий. Ответ с
    // введённым значением вернул бы пароль в страницу (и в журнал ответов), откуда он «уходит» дальше
    const files = filesMatching("app", /(^|\/)[\w-]*actions?\.ts$/);
    const FORM_VALUE = /formData\.(get|getAll)\(|formToObject\(|\bpassword\b|\bnewPassword\b|\bcurrentPassword\b|\bpasswordConfirm\b|\btoken\b|\bcode\b/;
    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      // Объекты ответа: `return { error: …, fields: { … } }` и `return { ok: … }`
      for (const m of text.matchAll(/return\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
        const body = m[1];
        if (!/\b(error|ok|fields)\s*:/.test(body)) continue;
        // Значения свойств error/ok/fields; ключи вроде `fields: { password: "…" }` — имя поля, не значение
        for (const prop of body.matchAll(/\b(?:error|ok)\s*:\s*([^,]+)|\bfields\s*:\s*\{([^}]*)\}/g)) {
          const value = prop[1] ?? (prop[2] ?? "").replace(/["']?\w+["']?\s*:/g, "");
          if (FORM_VALUE.test(value)) offenders.push(`${file}: ${m[0].slice(0, 80).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("хук не пишет введённое в хранилище", () => {
    const hook = read("lib/hooks/use-form-action.ts");
    expect(hook).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
