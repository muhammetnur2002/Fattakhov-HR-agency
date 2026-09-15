/**
 * Выгрузка отчётов (ТЗ 11.3).
 *
 * Формат — CSV, а не XLSX. Русский Excel открывает такой файл
 * напрямую: разделитель «точка с запятой» и метка кодировки в начале.
 * Библиотека для XLSX добавила бы мегабайт зависимостей ради
 * форматирования, которое в выгрузке данных всё равно переделывают
 * под себя. Если понадобятся несколько листов и оформление — заменяется
 * только эта функция.
 */

/** Метка кодировки: без неё Excel читает кириллицу как мусор. */
const BOM = "﻿";

/** Русский Excel по умолчанию ждёт точку с запятой, а не запятую. */
const SEPARATOR = ";";

/**
 * Символы, с которых начинается формула в Excel, Google Таблицах
 * и LibreOffice: =, +, -, @, а также табуляция и перевод строки,
 * которые открывающая программа тоже понимает как начало выражения.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  /*
    Инъекция формулы (CSV Injection, OWASP).

    В ячейках — заголовок вакансии, имя клиента, имя рекрутёра: текст,
    который вводят люди снаружи агентства. Открыть выгрузку в Excel
    и обнаружить, что «=HYPERLINK(...)» в названии вакансии превратился
    в работающую ссылку или запрос к чужому серверу, — не столько баг,
    сколько дыра: экранирование ниже защищает структуру файла (разделители,
    кавычки, переносы), но не спасает от символа, с которого начинается
    формула.

    Ведущий апостроф — общепринятое лечение: Excel и заменяющие его
    программы читают такую ячейку как принудительный текст и сам апостроф
    во время импорта CSV не показывают.
  */
  if (FORMULA_TRIGGERS.test(text)) {
    text = `'${text}`;
  }

  if (
    text.includes(SEPARATOR) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export type Sheet = {
  title: string;
  headers: string[];
  rows: unknown[][];
};

/**
 * Несколько таблиц в одном файле.
 *
 * CSV не знает про листы, поэтому таблицы идут подряд с заголовком
 * и пустой строкой между ними — Excel это читает нормально, а человек
 * понимает, где что.
 */
export function buildCsv(sheets: Sheet[]): string {
  const lines: string[] = [];

  for (const [index, sheet] of sheets.entries()) {
    if (index > 0) lines.push("");

    lines.push(escapeCell(sheet.title));
    lines.push(sheet.headers.map(escapeCell).join(SEPARATOR));

    for (const row of sheet.rows) {
      lines.push(row.map(escapeCell).join(SEPARATOR));
    }
  }

  // CRLF: Excel на Windows иначе склеивает строки
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Имя файла с датой — чтобы выгрузки не перезаписывали друг друга. */
export function reportFileName(prefix: string): string {
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replace(/\./g, "-");

  return `${prefix}_${date}.csv`;
}
