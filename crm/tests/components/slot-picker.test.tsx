// @vitest-environment jsdom
/**
 * SlotPicker: прошедшее время — не вариант выбора.
 *
 * Ссылка живёт в почте несколько дней, и часть предложенных слотов
 * к моменту открытия успевает пройти. Раньше они всё равно показывались
 * обычными кнопками: кандидат выбирал, жал «Подтвердить» и получал
 * отказ «это время уже прошло» — сервер проверку делал, а экран о ней
 * не знал. Если за выходные проходили все варианты, отказ приходил
 * на каждый вариант по очереди.
 *
 * Серверные действия (confirmSlotAction, requestOtherSlotsAction) не
 * дёргаем по-настоящему: тест не про отправку формы, а про то, что
 * показано и что можно нажать. Замена ниже возвращает пустой результат
 * и позволяет модулю просто загрузиться — импорт "use server" файла
 * вне сборки Next это обычный импорт функций, а настоящие функции
 * потянули бы за собой Prisma.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(public)/schedule/[token]/actions", () => ({
  confirmSlotAction: vi.fn(),
  requestOtherSlotsAction: vi.fn(),
}));

import { SlotPicker, type PublicSlot } from "@/components/schedule/slot-picker";

const NOW = new Date("2026-09-11T12:00:00Z").getTime();

function slot(id: string, hoursFromNow: number): PublicSlot {
  const startsAt = new Date(NOW + hoursFromNow * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return { id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

describe("SlotPicker: смешанные прошедшие и будущие варианты", () => {
  const slots = [slot("past-1", -48), slot("past-2", -2), slot("future-1", 48)];

  it("прошедшие показаны перечёркнутыми и недоступны для выбора", () => {
    render(
      <SlotPicker token="t" slots={slots} durationMinutes={60} now={NOW} />,
    );

    const pastButtons = screen.getAllByText("прошло").map((el) =>
      el.closest("button"),
    );
    expect(pastButtons).toHaveLength(2);
    for (const button of pastButtons) {
      expect(button).toBeDisabled();
    }
  });

  it("будущий вариант остаётся кликабельным", () => {
    render(
      <SlotPicker token="t" slots={slots} durationMinutes={60} now={NOW} />,
    );

    const timeButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d{2}:\d{2}/.test(b.textContent ?? ""));
    const enabled = timeButtons.filter((b) => !b.hasAttribute("disabled"));
    expect(enabled).toHaveLength(1);
  });

  it("сообщение «всё прошло» не показывается, пока есть хоть один будущий", () => {
    render(
      <SlotPicker token="t" slots={slots} durationMinutes={60} now={NOW} />,
    );
    expect(screen.queryByText("Эти варианты уже прошли")).not.toBeInTheDocument();
  });
});

describe("SlotPicker: прошли все варианты", () => {
  const allPast = [slot("p1", -48), slot("p2", -24)];

  it("вместо списка — предложение написать своё время", () => {
    render(
      <SlotPicker token="t" slots={allPast} durationMinutes={60} now={NOW} />,
    );

    expect(screen.getByText("Эти варианты уже прошли")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Предложить своё время" }),
    ).toBeInTheDocument();
  });

  it("кнопки времени не отображаются вовсе — нечего нажимать по ошибке", () => {
    render(
      <SlotPicker token="t" slots={allPast} durationMinutes={60} now={NOW} />,
    );
    const timeButtons = screen
      .queryAllByRole("button")
      .filter((b) => /^\d{2}:\d{2}/.test(b.textContent ?? ""));
    expect(timeButtons).toHaveLength(0);
  });
});

describe("SlotPicker: ничего не прошло", () => {
  const allFuture = [slot("f1", 24), slot("f2", 48)];

  it("оба варианта кликабельны, сообщения о просрочке нет", () => {
    render(
      <SlotPicker token="t" slots={allFuture} durationMinutes={60} now={NOW} />,
    );

    expect(screen.queryByText("Эти варианты уже прошли")).not.toBeInTheDocument();
    const timeButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d{2}:\d{2}/.test(b.textContent ?? ""));
    expect(timeButtons).toHaveLength(2);
    for (const button of timeButtons) {
      expect(button).not.toBeDisabled();
    }
  });
});

describe("SlotPicker: граница «сейчас»", () => {
  /*
    isSlotPast считает границу включающей: startsAt === now — уже
    поздно (см. lib/services/interview-status.ts). Слот, начинающийся
    ровно в момент отрисовки, не должен предлагаться к выбору.
  */
  it("слот, начинающийся ровно сейчас, считается прошедшим", () => {
    const rightNow = slot("now", 0);
    render(
      <SlotPicker
        token="t"
        slots={[rightNow]}
        durationMinutes={60}
        now={NOW}
      />,
    );
    expect(screen.getByText("Эти варианты уже прошли")).toBeInTheDocument();
  });
});
