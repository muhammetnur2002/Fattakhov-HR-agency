// @vitest-environment jsdom
/**
 * Фокус возвращается туда, откуда его взяли. Radix отдаёт его только на DialogTrigger; у окон,
 * открытых состоянием (кнопка рядом, а не внутри Dialog), и у блоков «Удалить? Да / Отмена»,
 * где кнопка пропадает, фокус уходил на <body> — клавиатура начинала с начала страницы.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/actions/vacancies", () => ({ deleteVacanciesAction: vi.fn(async () => ({})) }));
vi.mock("@/app/(agency)/a/candidates/seat-actions", () => ({ seatInVacancyAction: vi.fn(async () => ({})) }));

import { SeatInVacancy } from "@/components/candidates/seat-in-vacancy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DeleteVacancies } from "@/components/vacancies/delete-vacancies";
import { useConfirmFocus, useReturnFocus } from "@/lib/hooks/use-return-focus";

afterEach(cleanup);

/** Окно без DialogTrigger — ровно тот случай, из-за которого фокус терялся. */
function Harness({ withHook }: { withHook: boolean }) {
  const [open, setOpen] = useState(false);
  const returnFocus = useReturnFocus();
  return (
    <>
      <Button
        type="button"
        onClick={(e) => {
          returnFocus.remember(e.currentTarget);
          setOpen(true);
        }}
      >
        Открыть окно
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onCloseAutoFocus={withHook ? returnFocus.onCloseAutoFocus : undefined}>
          <DialogTitle>Окно</DialogTitle>
          <Button type="button" onClick={() => setOpen(false)}>
            Закрыть кнопкой
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("useReturnFocus: окно без DialogTrigger", () => {
  it("после Escape фокус на кнопке, которая открыла окно", async () => {
    render(<Harness withHook />);
    const opener = screen.getByRole("button", { name: "Открыть окно" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    // Внутрь окна фокус уходит
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("и после закрытия кнопкой внутри окна", async () => {
    render(<Harness withHook />);
    const opener = screen.getByRole("button", { name: "Открыть окно" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть кнопкой" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("контроль: без onCloseAutoFocus фокус оказывается на <body> — так было до правки", async () => {
    render(<Harness withHook={false} />);
    const opener = screen.getByRole("button", { name: "Открыть окно" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).not.toBe(opener);
  });

  it("кнопка, которой уже нет в странице, не ломает закрытие: фокус просто не переносится", async () => {
    function Gone() {
      const [open, setOpen] = useState(false);
      const [shown, setShown] = useState(true);
      const returnFocus = useReturnFocus();
      return (
        <>
          {shown && (
            <Button
              type="button"
              onClick={(e) => {
                returnFocus.remember(e.currentTarget);
                setOpen(true);
              }}
            >
              Открыть
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
              <DialogTitle>Окно</DialogTitle>
              <Button
                type="button"
                onClick={() => {
                  setShown(false);
                  setOpen(false);
                }}
              >
                Удалить и закрыть
              </Button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Gone />);
    const opener = screen.getByRole("button", { name: "Открыть" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Удалить и закрыть" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Открыть" })).toBeNull();
    // Пусть закрытие отработает целиком (onCloseAutoFocus идёт после ухода окна): фокус не прыгнул ни на что случайное
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).toBe(document.body);
  });

  it("forget(): запомненное забыто — после закрытия фокус не возвращается на кнопку", async () => {
    function Forgetful() {
      const [open, setOpen] = useState(false);
      const returnFocus = useReturnFocus();
      return (
        <>
          <Button
            type="button"
            onClick={(e) => {
              returnFocus.remember(e.currentTarget);
              setOpen(true);
            }}
          >
            Открыть
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
              <DialogTitle>Окно</DialogTitle>
              <Button
                type="button"
                onClick={() => {
                  returnFocus.forget();
                  setOpen(false);
                }}
              >
                Перейти на другую страницу
              </Button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Forgetful />);
    const opener = screen.getByRole("button", { name: "Открыть" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Перейти на другую страницу" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).not.toBe(opener);
  });
});

describe("окна кабинета", () => {
  it("«Посадить в вакансию»: после Escape фокус на кнопке «Посадить в вакансию»", async () => {
    render(
      <SeatInVacancy
        candidateId="c1"
        candidateName="Анна Веретенникова"
        vacancies={[{ id: "v2", label: "№2 Товаровед · Старфиш" }]}
        taken={[]}
      />,
    );
    const opener = screen.getByRole("button", { name: /Посадить в вакансию/ });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("useConfirmFocus: блок «Удалить? Да / Отмена» на месте кнопки", () => {
  function Block() {
    const [confirming, setConfirming] = useState(false);
    const { triggerRef, focusRef } = useConfirmFocus(confirming);
    return confirming ? (
      <div>
        <button type="button">Да, удалить</button>
        <button ref={focusRef} type="button" onClick={() => setConfirming(false)}>
          Отмена
        </button>
      </div>
    ) : (
      <button ref={triggerRef} type="button" onClick={() => setConfirming(true)}>
        Удалить
      </button>
    );
  }

  it("при открытии фокус — на безопасное действие, при отмене — обратно на кнопку", () => {
    render(<Block />);
    const trigger = screen.getByRole("button", { name: "Удалить" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "Отмена" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.click(cancel);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Удалить" }));
  });

  it("первый показ (блок закрыт) фокус не трогает", () => {
    render(<Block />);
    expect(document.activeElement).toBe(document.body);
  });

  it("настоящий блок: «Удалить закрытые» → «Отмена» → фокус вернулся на «Удалить закрытые»", () => {
    render(<DeleteVacancies ids={["v1"]} label="Удалить закрытые (1)" question="Удалить закрытые?" />);
    const trigger = screen.getByRole("button", { name: /Удалить закрытые \(1\)/ });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Отмена" }));

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Удалить закрытые \(1\)/ }));
  });

  it("блок с полем: фокус при открытии уходит в поле, а не на кнопку", () => {
    function WithField() {
      const [open, setOpen] = useState(false);
      const { triggerRef, focusRef } = useConfirmFocus<HTMLButtonElement, HTMLTextAreaElement>(open);
      return open ? (
        <div>
          <textarea ref={focusRef} aria-label="Причина" />
          <button type="button" onClick={() => setOpen(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          Вернуть с причиной
        </button>
      );
    }
    render(<WithField />);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть с причиной" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Причина" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Вернуть с причиной" }));
  });
});

describe("useConfirmFocus: вопрос блока и сам блок связаны", () => {
  function Named() {
    const [confirming, setConfirming] = useState(false);
    const { triggerRef, focusRef, questionId, groupProps } = useConfirmFocus(confirming);
    return confirming ? (
      <div {...groupProps}>
        <p id={questionId}>Удалить файл «план.pdf»?</p>
        <button type="button">Да, удалить</button>
        <button ref={focusRef} type="button" onClick={() => setConfirming(false)}>
          Отмена
        </button>
      </div>
    ) : (
      <button ref={triggerRef} type="button" onClick={() => setConfirming(true)}>
        Удалить
      </button>
    );
  }

  it("фокус встаёт на «Отмена» внутри группы, названной вопросом: читалка скажет вопрос, а не только «Отмена»", () => {
    render(<Named />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    const group = screen.getByRole("group", { name: "Удалить файл «план.pdf»?" });
    expect(group.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Отмена" }));
  });

  it("два блока на одной странице не делят идентификатор вопроса", () => {
    function Two() {
      const a = useConfirmFocus(false);
      const b = useConfirmFocus(false);
      return (
        <>
          <span data-testid="a">{a.questionId}</span>
          <span data-testid="b">{b.questionId}</span>
        </>
      );
    }
    render(<Two />);
    expect(screen.getByTestId("a").textContent).not.toBe(screen.getByTestId("b").textContent);
    expect(screen.getByTestId("a").textContent).toBeTruthy();
  });

  it("groupProps — role=group и aria-labelledby на questionId (размеров и разметки не добавляет)", () => {
    function Probe() {
      const { questionId, groupProps } = useConfirmFocus(false);
      return <div data-testid="p" data-q={questionId} {...groupProps} />;
    }
    render(<Probe />);
    const el = screen.getByTestId("p");
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-labelledby")).toBe(el.getAttribute("data-q"));
  });
});
