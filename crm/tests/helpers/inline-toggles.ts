/**
 * Поиск «блоков на месте кнопки» в исходниках — по устройству, а не по имени состояния (для тестов, не для приложения).
 *
 * Дефект a11y-4: кнопка («Удалить», «Изменить», «Отменить заявку») открывает блок — вопрос «Да / Отмена»,
 * поле причины, форму правки, — сама при этом пропадает, а на «Отмену» возвращается. Если фокус не ведут
 * руками, он оказывается на <body>: клавиатура и читалка экрана начинают страницу заново. Первый сторож искал
 * `const [confirming…|closing|rejecting, …] = useState(false)` — и не видел ни `mode` со строками, ни
 * `cancelling`, ни `editingFeedback`, ни `open`, поэтому комментарии и отмена заявки клиентом остались без правки.
 *
 * Здесь устройство, не имя. Состояние — это «переключатель на месте», если:
 *  - его включает обработчик нажатия (`onClick`): `setX(true)`, `setX("create")`, `setX(next)`;
 *  - его выключает обработчик нажатия — тоже напрямую или через объявленную в файле функцию:
 *    `setX(false)`, `setX(null)`, `setX("closed")`;
 *  - оно не открывает окно (`open={x}`): у окон свой путь — `onCloseAutoFocus`.
 * Имя ничего не решает. Переключатели, у которых кнопка остаётся на месте (включаются и выключаются одной и той
 * же кнопкой, `setX(!x)`), тоже находятся — они перечислены в исключениях теста с причиной.
 */

export type InlineToggle = {
  state: string;
  setter: string;
  /** Строка объявления `useState` (с 1). */
  line: number;
  opens: string[];
  closes: string[];
};

/** Что значит «закрыто»: такие аргументы выключают блок. */
const CLOSED_ARGS = new Set(["false", "null", "undefined", '""', "''", '"none"', '"closed"', '"view"', '"idle"']);

/** Содержимое парных скобок, начиная с открывающей в позиции `open`; строки и вложенность учитываются. */
function balanced(text: string, open: number): string {
  const pair: Record<string, string> = { "{": "}", "(": ")" };
  const start = text[open];
  const end = pair[start];
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === start) depth++;
    else if (c === end && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** Тело функции `name`, объявленной в файле (`function name(…) {…}` или `const name = (…) => {…}`), либо null. */
function localFunctionBody(text: string, name: string): string | null {
  const decl = new RegExp(
    `(?:function ${name}\\s*\\([^)]*\\)\\s*\\{|const ${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{)`,
  ).exec(text);
  return decl ? balanced(text, (decl.index ?? 0) + decl[0].length - 1) : null;
}

/**
 * Тела обработчиков `onClick={…}`. Если обработчик — имя функции из файла, берётся её тело; если он вызывает
 * функцию из файла (`onClick={() => open("create")}`), её тело добавляется к телу обработчика.
 */
function clickBodies(text: string): string[] {
  const bodies: string[] = [];
  for (const m of text.matchAll(/\bonClick=\{/g)) {
    const body = balanced(text, (m.index ?? 0) + m[0].length - 1).trim();
    const ident = /^[A-Za-z_$][\w$]*$/.exec(body)?.[0];
    if (ident) {
      bodies.push(localFunctionBody(text, ident) ?? body);
      continue;
    }
    const callees = [...body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\(/g)].map((c) => c[1]);
    const extra = callees.map((c) => localFunctionBody(text, c)).filter((b): b is string => b !== null);
    bodies.push([body, ...extra].join("\n"));
  }
  return bodies;
}

/** Аргументы всех вызовов `setter(…)` в тексте. */
function callArgs(text: string, setter: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`(?<![\\w$.])${setter}\\(`, "g"))) {
    out.push(balanced(text, (m.index ?? 0) + m[0].length - 1).replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * Включающий аргумент: `true`, слово-режим в кавычках (`"create"`, `"CLOSED_FAILED"`) или имя (параметр функции,
 * через которую кнопка открывает блок: `open("create")` → `setMode(next)`). Выражения (`result.error`, шаблоны,
 * объекты) и фразы по-русски («Страница отвязана…») — это данные и сообщения, а не режим блока.
 */
const isOpening = (arg: string) =>
  arg === "true" || /^(["'])[\w-]+\1$/.test(arg) || (/^[A-Za-z_$][\w$]*$/.test(arg) && !CLOSED_ARGS.has(arg));

export function findInlineToggles(text: string): InlineToggle[] {
  const clicks = clickBodies(text);
  if (clicks.length === 0) return [];
  const found: InlineToggle[] = [];
  for (const m of text.matchAll(/const \[(\w+), (set\w+)\] = (?:React\.)?useState\b/g)) {
    const [, state, setter] = m;
    // Состояние окна: `open={x}`, `open={Boolean(x)}`, `open={x !== null}` — у окон свой возврат фокуса
    if (new RegExp(`\\bopen=\\{[^}]*\\b${state}\\b`).test(text)) continue;

    // Каждый обработчик — отдельно: блок открывает одна кнопка, а закрывает другая. Если «включить» и «выключить»
    // стоят в одном обработчике, это не блок, а признак занятости (`setBusy(true)` … `setBusy(false)` после ответа)
    const perHandler = clicks.map((body) => callArgs(body, setter));
    const opens = perHandler.flatMap((args, i) =>
      args.filter((a) => isOpening(a) && !perHandler[i].some((b) => CLOSED_ARGS.has(b))),
    );
    const closes = perHandler.flatMap((args) => args.filter((a) => CLOSED_ARGS.has(a)));
    // Одна кнопка, которая и открывает, и закрывает: `setX(!x)` — кнопка остаётся на месте, но она тоже переключатель
    const toggles = perHandler.flatMap((args) => args.filter((a) => a === `!${state}`));
    if (toggles.length > 0) {
      found.push({ state, setter, line: text.slice(0, m.index ?? 0).split("\n").length, opens: toggles, closes: toggles });
      continue;
    }
    if (opens.length === 0 || closes.length === 0) continue;
    found.push({ state, setter, line: text.slice(0, m.index ?? 0).split("\n").length, opens, closes });
  }
  return found;
}
