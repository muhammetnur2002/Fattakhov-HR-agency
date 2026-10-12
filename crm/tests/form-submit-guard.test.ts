/**
 * Форма не уходит GET-ом и результат вне формы находится фокусом (сверка 12.10.2026, проверка PR #120).
 *
 * 1. Форма на `useFormAction` до загрузки скриптов (медленный телефон, блокировщик, не пришёл чанк) — обычная
 *    HTML-форма. Без `action`/`method` она отправляется GET, и пароли, токен ссылки и ПДн кандидата уходят в адресную
 *    строку, историю и журналы сервера. Хук отдаёт `action={formAction}`; каждая форма берёт его целиком (`{...formProps}`).
 * 2. То же у любой другой формы с `onSubmit` и `preventDefault` без `action`/`method` (двенадцать штук на 12.10.2026:
 *    вход по номеру, 2FA, анкета, правка кандидата и брифа, задания, договор, сообщения студентам, поиск): они
 *    берут `{...noScriptForm}` (`lib/forms/no-script.ts`, POST на безопасный приёмник), `action={серверное действие}`
 *    над `FormData` или остаются явным GET из перечня с причиной. Проверяется ЛЮБАЯ `<form>` в `app/` и `components/`.
 * 3. Плашка результата вне формы (после неё, рядом) не находится поиском внутри формы: ей нужен `ref={messageRef}`.
 */
import { describe, expect, it } from "vitest";

import { jsxTags, jsxTree, read, sources, stripComments, type JsxNode } from "./helpers/jsx-source";

const FILES = [...sources("app"), ...sources("components")].filter((f) => !f.includes("components/ui/"));
const FORM = /^(motion\.)?form$/;

describe("форма не уходит GET-ом", () => {
  it("хук отдаёт action вместе с onSubmit: formProps = { ref, action: formAction, onSubmit, noValidate }", () => {
    const hook = read("lib/hooks/use-form-action.ts");
    const props = /formProps:\s*\{([^}]*)\}/.exec(hook)?.[1] ?? "";
    expect(props).toMatch(/\baction:\s*formAction\b/);
    expect(props).toMatch(/\bonSubmit\b/);
  });

  it("каждая форма в файле с useFormAction имеет action, method=post или formProps целиком", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (!/useFormAction\b/.test(read(file))) continue;
      for (const form of jsxTree(read(file)).filter((x) => FORM.test(x.name))) {
        const safe =
          /\baction=/.test(form.text) || /\bmethod=["{]\s*["']?post/i.test(form.text) || /\{\.\.\.[\w.]*formProps\}/.test(form.text);
        if (!safe) offenders.push(`${file}:${form.line}`);
      }
    }
    expect(offenders, "форма без action и method уходит GET-ом: возьми {...formProps} или action={…}").toEqual([]);
  });

  it("форма с formProps не перебивает action/method своим", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const form of jsxTree(read(file)).filter((x) => FORM.test(x.name) && /\{\.\.\.[\w.]*formProps\}/.test(x.text))) {
        if (/\b(action|method)=/.test(form.text)) offenders.push(`${file}:${form.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Явный GET допустим только там, где запрос в адресе — задуманный результат, а секретов в форме нет. Каждая запись
 * проверяется на живость: пропала форма или она стала не GET — перечень надо сократить.
 */
const GET_FORMS: Record<string, string> = {
  "components/shell/global-search-field.tsx":
    "строка поиска по кабинету: запрос в адресе — результат (router.push кладёт его туда же), без скриптов это обычный GET на страницу поиска",
  "app/(agency)/a/reviews/students/student-filters.tsx":
    "фильтры списка проверок: значения в адресе — состояние страницы, ссылкой делятся, секретов в форме нет",
};

const ALL_FILES = [...sources("app"), ...sources("components")];

type FormKind = "formProps" | "noScriptForm" | "function-action" | "post" | "get" | "unsafe";

/** Как форма отправится в разметке сервера, пока скрипты не загрузились. */
function kindOf(tag: string): FormKind {
  if (/\{\.\.\.[\w.]*formProps\}/.test(tag)) return "formProps";
  if (/\{\.\.\.noScriptForm\}/.test(tag)) return "noScriptForm";
  // `method` с любым другим значением (`dialog`, опечатка) — не POST, а значит и не безопасно
  const method = /\bmethod=(?:\{\s*)?["'`]\s*(\w+)/i.exec(tag)?.[1]?.toLowerCase();
  if (method === "post") return "post";
  if (method === "get") return "get";
  // `action="/путь"` без method — тоже GET: строку браузер не перехватит
  const action = /\baction=(\{)?/.exec(tag);
  if (action) {
    const literal = /\baction=(?:\{\s*)?["'`]/.test(tag);
    // Функция или серверное действие: React отдаёт POST серверного действия или перехват, не GET
    if (!literal) return "function-action";
  }
  return "unsafe";
}

describe("любая форма безопасна, пока скрипты не загрузились", () => {
  const forms = ALL_FILES.flatMap((file) =>
    jsxTags(stripComments(read(file)), "(?:motion\\.)?form").map((tag) => ({ file, line: tag.line, text: tag.text, kind: kindOf(tag.text) })),
  );

  it("форм в разметке много: разбор не промахнулся мимо всех", () => {
    expect(forms.length).toBeGreaterThan(70);
  });

  it("у каждой <form> есть action с функцией, method=post, {...formProps} или {...noScriptForm}", () => {
    const offenders = forms.filter((f) => f.kind === "unsafe").map((f) => `${f.file}:${f.line}`);
    expect(
      offenders,
      "форма без action и method отправляется GET-ом до загрузки скриптов: поля (пароли, ПДн) уходят в адрес. " +
        "Возьми {...noScriptForm} (lib/forms/no-script.ts), action={серверноеДействие} или {...formProps} из useFormAction",
    ).toEqual([]);
  });

  it("GET допустим только у форм из перечня с причиной", () => {
    const offenders = forms.filter((f) => f.kind === "get" && !(f.file in GET_FORMS)).map((f) => `${f.file}:${f.line}`);
    expect(offenders, "явный GET — только поиск и фильтры без секретов; добавь файл в GET_FORMS с причиной").toEqual([]);
  });

  it("каждая запись перечня GET-форм жива и не держит поле пароля", () => {
    for (const file of Object.keys(GET_FORMS)) {
      expect(forms.some((f) => f.file === file && f.kind === "get"), `${file}: GET-формы больше нет — убери запись`).toBe(true);
      expect(read(file), `${file}: в GET-форме нет места паролю`).not.toMatch(/type=["']password["']/);
    }
  });

  it("форма с {...noScriptForm} не перебивает action и method своими", () => {
    const offenders = forms
      .filter((f) => f.kind === "noScriptForm" && /\b(action|method)=/.test(f.text))
      .map((f) => `${f.file}:${f.line}`);
    expect(offenders).toEqual([]);
  });

  it("формы собираются тегом <form>: через createElement, as= и motion.create их не обойти", () => {
    const offenders = ALL_FILES.filter((file) =>
      /createElement\(\s*["']form["']|\bas=["']form["']|motion\.create\(\s*["']form["']|\bstyled\.form\b/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("приёмник отправки без скриптов не читает и не отражает поля", () => {
  const route = read("app/api/no-script-form/route.ts");
  const helper = read("lib/forms/no-script.ts");

  it("noScriptForm — POST на существующий маршрут с обработчиком POST", () => {
    expect(helper).toMatch(/NO_SCRIPT_FORM_PATH\s*=\s*"\/api\/no-script-form"/);
    expect(helper).toMatch(/method:\s*"post"/);
    expect(route).toMatch(/export\s+async\s+function\s+POST\b/);
    // Не GET: иначе приёмник сам был бы дырой — поля в адрес он не получит, а вот страница с ними в журнале
    expect(route).not.toMatch(/export\s+(async\s+)?function\s+GET\b/);
  });

  it("обработчик не читает тело запроса и не кладёт ничего из него в адрес ответа", () => {
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\.(formData|json|text|arrayBuffer|blob)\(|\.body\b|\.nextUrl|searchParams/);
  });

  it("маршрут открыт и ещё не вошедшим: вход по номеру и регистрация — формы на клиентском коде", () => {
    const prefixes = /const PUBLIC_PREFIXES = \[([\s\S]*?)\n\];/.exec(read("proxy.ts"))?.[1] ?? "";
    expect(prefixes).toContain('"/api/no-script-form"');
  });
});

describe("плашка результата вне формы получает ссылку из хука", () => {
  const MESSAGE = /^(FormMessage|Feedback)$/;
  function insideHookForm(n: JsxNode): boolean {
    for (let p = n.parent; p; p = p.parent) if (FORM.test(p.name) && /\{\.\.\.[\w.]*formProps\}/.test(p.text)) return true;
    return false;
  }

  it("FormMessage/Feedback, читающие состояние useFormAction, стоящие вне его формы, несут ref={…messageRef}", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      if (!/useFormAction\b/.test(text)) continue;
      const tree = jsxTree(text);
      // Компоненты файла по отдельности: в соседнем `state` может быть от useActionState, а не от хука
      const starts = [...text.matchAll(/^(?:export )?(?:default )?function \w+/gm)].map((m) => m.index ?? 0);
      starts.forEach((start, i) => {
        const end = starts[i + 1] ?? text.length;
        const body = text.slice(start, end);
        if (/^(?:export )?(?:default )?function Feedback\b/.test(body)) return; // обёртка читает свой параметр
        // Состояния, что принадлежат хуку: `const { state, … } = useFormAction` и `const имя = useFormAction`
        const states = new Set<string>();
        for (const m of body.matchAll(/const\s*\{([^}]*)\}\s*=\s*useFormAction\b/g)) {
          const alias = /\bstate(?:\s*:\s*(\w+))?/.exec(m[1]);
          if (alias) states.add(alias[1] ?? "state");
        }
        for (const m of body.matchAll(/const\s+(\w+)\s*=\s*useFormAction\b/g)) states.add(`${m[1]}.state`);
        if (states.size === 0) return;

        for (const node of tree.filter((x) => MESSAGE.test(x.name) && x.index >= start && x.index < end)) {
          if (insideHookForm(node)) continue;
          // Выражение, из которого плашка берёт результат: `state={x}` у Feedback, `error={x.error}` у FormMessage
          const expr = /\b(?:state|error|ok)=\{\s*([\w.]+?)(?:\.(?:error|ok))?\s*[},]/.exec(node.text)?.[1];
          if (!expr || !states.has(expr)) continue;
          if (!/\b(?:ref|messageRef)=\{[\w.]*messageRef\}/.test(node.text)) offenders.push(`${file}:${node.line} <${node.name}>`);
        }
      });
    }
    expect(offenders, "плашка вне формы: <FormMessage ref={messageRef} …> (messageRef — из useFormAction)").toEqual([]);
  });
});
