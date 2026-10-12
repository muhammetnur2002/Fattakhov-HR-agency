// @vitest-environment jsdom
/**
 * Постоянная область для читалки (замечание проверки PR #120, 12.10.2026).
 *
 * «Сохранено» было `role="status"`, вставленным в страницу сразу вместе с текстом. Собственный комментарий
 * `SubmitButton` говорит, что такая область «объявляется не везде», и потому ход отправки держит пустую область
 * заранее. Теперь так же устроен успех: область `LiveAnnouncer` стоит в корневом макете и всегда пуста, а
 * `FormMessage` с `ok` меняет только её содержимое. Ошибка остаётся `role="alert"`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormMessage } from "@/components/ui/form-message";
import { LiveAnnouncer, announce } from "@/components/ui/live-announcer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const region = () => document.getElementById("live-announcer")!;
const flush = () => act(() => void vi.advanceTimersByTime(200));

describe("LiveAnnouncer", () => {
  it("область есть с первой отрисовки, пуста и вежливая", () => {
    render(<LiveAnnouncer />);
    expect(region()).toHaveAttribute("role", "status");
    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region()).toHaveAttribute("aria-atomic", "true");
    expect(region()).toBeEmptyDOMElement();
    expect(region()).toHaveClass("sr-only");
  });

  it("announce меняет только содержимое области, сама она остаётся тем же элементом", () => {
    render(<LiveAnnouncer />);
    const before = region();
    announce("Сохранено");
    flush();
    expect(region()).toBe(before);
    expect(region()).toHaveTextContent("Сохранено");
  });

  it("одно и то же сообщение дважды подряд объявляется заново: область сперва очищается", () => {
    render(<LiveAnnouncer />);
    announce("Сохранено");
    flush();
    announce("Сохранено");
    expect(region()).toBeEmptyDOMElement();
    flush();
    expect(region()).toHaveTextContent("Сохранено");
  });

  it("области в странице нет (тест, страница без макета) — ничего не падает", () => {
    expect(() => announce("Сохранено")).not.toThrow();
  });
});

describe("FormMessage → область для читалки", () => {
  it("успех попадает в область, у видимой плашки роли нет", () => {
    render(
      <>
        <LiveAnnouncer />
        <FormMessage ok="Данные сохранены" />
      </>,
    );
    flush();
    expect(region()).toHaveTextContent("Данные сохранены");
    expect(screen.getByText("Данные сохранены", { selector: "[data-slot=alert-description]" })).toBeInTheDocument();
    // Единственный status в странице — сама область: плашка не читается дважды
    expect(screen.getAllByRole("status")).toEqual([region()]);
  });

  it("compact: то же", () => {
    render(
      <>
        <LiveAnnouncer />
        <FormMessage compact ok="Отправлено" />
      </>,
    );
    flush();
    expect(region()).toHaveTextContent("Отправлено");
    expect(screen.getAllByRole("status")).toEqual([region()]);
  });

  it("новый успех после прежнего — новый текст в области", () => {
    const { rerender } = render(
      <>
        <LiveAnnouncer />
        <FormMessage ok="Первое" />
      </>,
    );
    flush();
    rerender(
      <>
        <LiveAnnouncer />
        <FormMessage ok="Второе" />
      </>,
    );
    flush();
    expect(region()).toHaveTextContent("Второе");
  });

  it("ошибка в область не пишется: она role=alert и объявляется сама", () => {
    render(
      <>
        <LiveAnnouncer />
        <FormMessage error="Не получилось" />
      </>,
    );
    flush();
    expect(region()).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toHaveTextContent("Не получилось");
  });

  it("ошибка без успеха не очищает прежнее объявление и не шумит", () => {
    render(
      <>
        <LiveAnnouncer />
        <FormMessage error={null} ok={null} />
      </>,
    );
    flush();
    expect(region()).toBeEmptyDOMElement();
  });
});

describe("корневой макет", () => {
  it("область для читалки смонтирована в app/layout.tsx — на каждой странице, кабинетной и публичной", () => {
    expect(readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8")).toMatch(/<LiveAnnouncer\s*\/>/);
  });
});
