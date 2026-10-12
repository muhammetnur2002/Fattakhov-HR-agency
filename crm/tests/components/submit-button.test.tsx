// @vitest-environment jsdom
/**
 * SubmitButton: общая кнопка отправки формы.
 *
 * Сверка 11.10.2026: ~22 кнопки `type="submit"` писались заново, потому что общая не умела двух
 * вещей — форму, что уходит через `onSubmit` и `startTransition` (её `useFormStatus` не видит),
 * и форму с несколькими кнопками отправки (индикатор должен крутиться только у нажатой).
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SubmitButton } from "@/components/ui/submit-button";

/** Действие формы, которое висит, пока тест не отпустит. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

describe("SubmitButton", () => {
  it("явный loading включает индикатор без всякой формы-действия", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SubmitButton loading pendingLabel="Сохраняем…">
          Сохранить
        </SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Сохраняем…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("без loading и без отправки — обычная кнопка отправки", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SubmitButton pendingLabel="Сохраняем…">Сохранить</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("форма с action: индикатор и подпись «идёт» — только у нажатой кнопки, вторая блокируется", async () => {
    const { promise, release } = gate();
    const user = userEvent.setup();
    render(
      <form
        action={async () => {
          await promise;
        }}
      >
        <SubmitButton name="submit" value="false" pendingLabel="Сохраняем…">
          Сохранить черновик
        </SubmitButton>
        <SubmitButton name="submit" value="true" pendingLabel="Отправляем…">
          Отправить
        </SubmitButton>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    const pressed = await screen.findByRole("button", { name: "Сохраняем…" });
    expect(pressed).toHaveAttribute("aria-busy", "true");
    // Вторая не «Отправляем…»: она только заблокирована, без индикатора
    const other = screen.getByRole("button", { name: "Отправить" });
    expect(other).toBeDisabled();
    expect(other).not.toHaveAttribute("aria-busy");
    expect(other.querySelector("svg.animate-spin")).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled());
  });

  it("форма с одной кнопкой без имени: отправка занимает её, как и раньше", async () => {
    const { promise, release } = gate();
    const user = userEvent.setup();
    render(
      <form
        action={async () => {
          await promise;
        }}
      >
        <SubmitButton pendingLabel="Сохраняем…">Сохранить</SubmitButton>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("button", { name: "Сохраняем…" })).toHaveAttribute("aria-busy", "true");
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled());
  });
});

describe("ход отправки для читалки", () => {
  // Сверка 11.10.2026 (a11y-7): кнопка на время запроса блокируется, смену её подписи читалка не
  // озвучивает — слепой пользователь не знал, ушла ли форма.
  it("рядом с кнопкой всегда есть пустая живая область, во время отправки в ней «Отправляем…»", () => {
    const { rerender } = render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SubmitButton pendingLabel="Сохраняем…">Сохранить</SubmitButton>
      </form>,
    );
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    rerender(
      <form onSubmit={(e) => e.preventDefault()}>
        <SubmitButton loading pendingLabel="Сохраняем…">
          Сохранить
        </SubmitButton>
      </form>,
    );
    // Тот же элемент: область не пересоздаётся, иначе читалка её не объявит
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Отправляем…");
    expect(status).toHaveClass("sr-only");
  });

  it("область стоит ДО кнопки и вне её: кнопка остаётся последним ребёнком (нет лишнего отступа space-y)", () => {
    render(
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <input aria-label="поле" />
        <SubmitButton>Сохранить</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button.parentElement?.lastElementChild).toBe(button);
    expect(button.contains(screen.getByRole("status"))).toBe(false);
  });

  it("announce={false}: области нет (кнопка, что объявляет себя сама)", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SubmitButton announce={false}>Сохранить</SubmitButton>
      </form>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
