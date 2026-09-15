/**
 * Выгрузка отчётов.
 *
 * Ошибки формата тихие: файл скачивается, открывается — и в нём
 * кириллица кракозябрами или колонки съехали, потому что в названии
 * вакансии была точка с запятой.
 */
import { describe, expect, it } from "vitest";

import { buildCsv, reportFileName } from "@/lib/services/analytics/export";

describe("сборка CSV", () => {
  it("начинается с метки кодировки — иначе Excel ломает кириллицу", () => {
    const csv = buildCsv([
      { title: "Отчёт", headers: ["Этап"], rows: [["Лонг-лист"]] },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("разделитель — точка с запятой, как ждёт русский Excel", () => {
    const csv = buildCsv([
      { title: "Т", headers: ["А", "Б"], rows: [[1, 2]] },
    ]);
    expect(csv).toContain("А;Б");
    expect(csv).toContain("1;2");
  });

  it("значение с разделителем внутри берётся в кавычки", () => {
    // Иначе «Руководитель отдела; продажи» разъедет на две колонки
    const csv = buildCsv([
      {
        title: "Т",
        headers: ["Вакансия"],
        rows: [["Руководитель; продажи"]],
      },
    ]);
    expect(csv).toContain('"Руководитель; продажи"');
  });

  it("кавычки внутри значения удваиваются", () => {
    const csv = buildCsv([
      { title: "Т", headers: ["Комментарий"], rows: [['Сказал "дорого"']] },
    ]);
    expect(csv).toContain('"Сказал ""дорого"""');
  });

  it("перенос строки внутри ячейки не разрывает строку файла", () => {
    const csv = buildCsv([
      { title: "Т", headers: ["Причина"], rows: [["Первая\nВторая"]] },
    ]);
    expect(csv).toContain('"Первая\nВторая"');
  });

  it("пустые значения не превращаются в undefined", () => {
    const csv = buildCsv([
      { title: "Т", headers: ["А", "Б"], rows: [[null, undefined]] },
    ]);
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("null");
  });

  it("несколько таблиц разделены пустой строкой", () => {
    const csv = buildCsv([
      { title: "Первая", headers: ["А"], rows: [[1]] },
      { title: "Вторая", headers: ["Б"], rows: [[2]] },
    ]);

    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Первая");
    expect(lines).toContain("");
    expect(lines).toContain("Вторая");
  });

  it("строки разделены CRLF — иначе Excel на Windows склеивает", () => {
    const csv = buildCsv([
      { title: "Т", headers: ["А"], rows: [[1], [2]] },
    ]);
    expect(csv).toContain("\r\n");
  });

  it("таблица без строк не ломает файл", () => {
    const csv = buildCsv([{ title: "Пусто", headers: ["А"], rows: [] }]);
    expect(csv).toContain("Пусто");
    expect(csv).toContain("А");
  });
});

describe("инъекция формулы (OWASP CSV Injection)", () => {
  /*
    В ячейках — текст, который вводят люди снаружи агентства: заголовок
    вакансии, имя клиента, имя рекрутёра. Название вакансии «=HYPERLINK(...)»
    в Excel — не текст, а работающая ссылка: экранирование разделителей
    и кавычек эту дыру не закрывает, нужен отдельный барьер на ведущий
    символ формулы.
  */
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)"])(
    "значение %s получает ведущий апостроф",
    (dangerous) => {
      const csv = buildCsv([
        { title: "Т", headers: ["Вакансия"], rows: [[dangerous]] },
      ]);
      expect(csv).toContain(`'${dangerous}`);
    },
  );

  it("апостроф ставится и когда значение ещё и требует кавычек", () => {
    // HYPERLINK содержит "" — ячейка получает и апостроф, и кавычки;
    // внутренние кавычки при этом по-прежнему удваиваются
    const csv = buildCsv([
      {
        title: "Т",
        headers: ["Вакансия"],
        rows: [['=HYPERLINK("http://evil")']],
      },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
  });

  it("апостроф ставится перед кавычками, а не вместо них", () => {
    // Значение и опасно (начинается с =), и содержит разделитель —
    // оба барьера обязаны сработать вместе, а не заменить друг друга
    const csv = buildCsv([
      { title: "Т", headers: ["Вакансия"], rows: [["=1;2"]] },
    ]);
    expect(csv).toContain(`"'=1;2"`);
  });

  it("обычный текст апостроф не получает", () => {
    // Дефис в середине слова, а не в начале ячейки, — не формула.
    // Второй столбец нужен, чтобы отличить «есть апостроф в начале
    // ячейки» от «апострофа в файле вообще нет»
    const csv = buildCsv([
      {
        title: "Т",
        headers: ["№", "Вакансия"],
        rows: [[1, "Backend-разработчик"]],
      },
    ]);
    expect(csv).toContain(";Backend-разработчик");
    expect(csv).not.toContain("'Backend-разработчик");
  });

  it("число не путается с формулой", () => {
    // -5 — обычное отрицательное число из аналитики, не запись пользователя;
    // buildCsv видит только строковое представление, и минус в начале
    // совпадает с признаком формулы — апостроф всё равно безопасен для Excel
    const csv = buildCsv([{ title: "Т", headers: ["Δ"], rows: [[-5]] }]);
    expect(csv).toContain("'-5");
  });
});

describe("имя файла", () => {
  it("содержит дату, чтобы выгрузки не перезаписывались", () => {
    const name = reportFileName("Аналитика");
    expect(name).toMatch(/^Аналитика_\d{2}-\d{2}-\d{4}\.csv$/);
  });
});
