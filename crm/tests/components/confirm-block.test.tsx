// @vitest-environment jsdom
/**
 * ConfirmBlock — единственный блок подтверждения опасного действия (components/ui/confirm-block.tsx).
 *
 * До 13.10.2026 «Да / Отмена» был написан заново в двадцати местах, и каждая копия вела себя чуть иначе: у одной
 * «Отмена» не блокировалась на время запроса, у другой ошибка уходила в соседний угол страницы, у третьей не было
 * Escape, а двойное нажатие Enter отправляло действие дважды. Здесь проверено всё, что блок обещает: фокус при
 * открытии и закрытии, название группы вопросом, Escape, ожидание без двойного нажатия, ошибка внутри блока,
 * «страница устарела» не глотается, и вид — по умолчанию опасный.
 */
import { Component, useRef, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import { Button } from "@/components/ui/button";
import { ConfirmBlock, ConfirmExtraAction, type ConfirmResult } from "@/components/ui/confirm-block";

afterEach(cleanup);

const focused = () => document.activeElement;
const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** Нажать так, как нажимает клавиатура: фокус уже на кнопке (Safari кнопке фокус при клике не даёт). */
function press(el: HTMLElement) {
  el.focus();
  fireEvent.click(el);
}

/** Обещание, которое закрывается снаружи: так видно состояние «идёт запрос». */
function deferred<T = ConfirmResult>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const trigger = <Button type="button">Удалить файл</Button>;

function Simple({ onConfirm = vi.fn(), ...rest }: { onConfirm?: () => ConfirmResult | Promise<ConfirmResult> } & Partial<Parameters<typeof ConfirmBlock>[0]>) {
  return (
    <ConfirmBlock
      trigger={trigger}
      question="Удалить файл?"
      confirmLabel="Да, удалить"
      pendingLabel="Удаляем…"
      onConfirm={onConfirm}
      {...(rest as object)}
    />
  );
}

describe("открытие и закрытие кнопкой", () => {
  it("пока закрыт — только кнопка, ни вопроса, ни групп", () => {
    render(<Simple />);
    expect(button("Удалить файл")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText("Удалить файл?")).toBeNull();
    expect(focused()).toBe(document.body);
  });

  it("клик по кнопке: она пропадает, встаёт вопрос, фокус на «Отмене»", () => {
    render(<Simple />);
    press(button("Удалить файл"));

    expect(screen.queryByRole("button", { name: "Удалить файл" })).toBeNull();
    const block = screen.getByRole("group", { name: "Удалить файл?" });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    expect(within(block).getByRole("button", { name: "Да, удалить" })).toBeTruthy();
  });

  it("фокус на «Отмене», а не на «Да»: случайный Enter ничего не стирает", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    expect(focused()).not.toBe(button("Да, удалить"));
    expect(focused()).toBe(button("Отмена"));
  });

  it("вопрос в разметке один: им названа группа и описана «Отмена», копии для читалки нет", () => {
    render(<Simple />);
    press(button("Удалить файл"));

    expect(screen.getAllByText("Удалить файл?")).toHaveLength(1);
    expect(focused()).toHaveAccessibleDescription("Удалить файл?");
    expect(screen.getByRole("group", { name: "Удалить файл?" })).toBeTruthy();
  });

  it("«Отмена» закрывает блок и возвращает фокус на ту же кнопку", () => {
    const onConfirm = vi.fn();
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    fireEvent.click(button("Отмена"));

    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Удалить файл"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("свои подписи: «Оставить» вместо «Отмена»", () => {
    render(<Simple cancelLabel="Оставить" />);
    press(button("Удалить файл"));
    expect(focused()).toBe(button("Оставить"));
    expect(screen.queryByRole("button", { name: "Отмена" })).toBeNull();
  });

  it("onClick самой кнопки отрабатывает, а preventDefault оставляет блок закрытым", () => {
    const onClick = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<Simple trigger={<Button type="button" onClick={onClick}>Удалить файл</Button>} />);
    press(button("Удалить файл"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("Escape", () => {
  it("закрывает блок и возвращает фокус на кнопку", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    fireEvent.keyDown(focused()!, { key: "Escape" });

    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Удалить файл"));
  });

  it("работает и с фокусом на «Да»", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    button("Да, удалить").focus();
    fireEvent.keyDown(focused()!, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Удалить файл"));
  });

  it("не закрывает блок, пока идёт запрос", async () => {
    const task = deferred();
    render(<Simple onConfirm={() => task.promise} />);
    press(button("Удалить файл"));
    fireEvent.click(button("Да, удалить"));

    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    expect(screen.getByRole("group")).toBeTruthy();

    await act(async () => task.resolve(undefined));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("Escape, который уже съел вложенный список или окно (defaultPrevented), блок не трогает", () => {
    render(
      <ConfirmBlock
        trigger={trigger}
        question="Удалить файл?"
        confirmLabel="Да, удалить"
        onConfirm={vi.fn()}
      >
        <input aria-label="Причина" onKeyDown={(e) => e.preventDefault()} />
      </ConfirmBlock>,
    );
    press(button("Удалить файл"));
    fireEvent.keyDown(screen.getByLabelText("Причина"), { key: "Escape" });
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("Escape съедает блок: выше по дереву (панель, окно) его не получают — закрывается только вопрос", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Simple />
      </div>,
    );
    press(button("Удалить файл"));
    fireEvent.keyDown(focused()!, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });

  it("другие клавиши блок не закрывают", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    fireEvent.keyDown(focused()!, { key: "Enter" });
    fireEvent.keyDown(focused()!, { key: "a" });
    expect(screen.getByRole("group")).toBeTruthy();
  });
});

describe("подтверждение и ожидание", () => {
  it("«Да» выполняет дело и закрывает блок; фокус возвращается на кнопку, если она ещё в странице", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Удалить файл"));
  });

  it("пока идёт запрос: «Да» с индикатором и подписью «Удаляем…», «Отмена» заблокирована, группа занята", async () => {
    const task = deferred();
    render(<Simple onConfirm={() => task.promise} />);
    press(button("Удалить файл"));
    fireEvent.click(button("Да, удалить"));

    const yes = button("Удаляем…");
    expect(yes).toHaveProperty("disabled", true);
    expect(yes.getAttribute("data-loading")).toBe("true");
    expect(yes.getAttribute("aria-busy")).toBe("true");
    expect(button("Отмена")).toHaveProperty("disabled", true);
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");

    await act(async () => task.resolve(undefined));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("повторное нажатие во время запроса игнорируется: дело выполняется один раз", async () => {
    const task = deferred();
    const onConfirm = vi.fn(() => task.promise);
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    const yes = button("Да, удалить");
    fireEvent.click(yes);
    fireEvent.click(yes);
    fireEvent.click(yes);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => task.resolve(undefined));
  });

  it("замок: два нажатия, пришедшие до перерисовки (одна пачка событий), выполняют дело один раз", async () => {
    // Обычное двойное нажатие гасит отключение кнопки после перерисовки — тест выше. Замок (useRef) страхует то, что
    // перерисовка не успела: оба нажатия в одном act, кнопка в разметке ещё не отключена. Без замка дело шло бы дважды
    const task = deferred();
    const onConfirm = vi.fn(() => task.promise);
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    const yes = button("Да, удалить");
    await act(async () => {
      fireEvent.click(yes);
      fireEvent.click(yes);
    });

    try {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    } finally {
      // Закрыть запрос и при красном тесте: иначе висящее обещание тянет за собой соседние тесты
      await act(async () => task.resolve(undefined));
    }
  });

  it("замок снимается после ответа: при ошибке «Да» можно нажать снова", async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce({ error: "Не вышло" }).mockResolvedValueOnce(undefined);
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("false: блок остаётся открытым без сообщения (причину уже показал вызывающий)", async () => {
    render(<Simple onConfirm={async () => false} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });

    expect(screen.getByRole("group")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button("Да, удалить")).toHaveProperty("disabled", false);
  });
});

describe("ошибка внутри блока", () => {
  async function failing(message = "Файл занят другим действием") {
    render(<Simple onConfirm={async () => ({ error: message })} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });
  }

  it("{ error }: блок остаётся открытым, текст — в role=alert внутри группы, кнопки снова доступны", async () => {
    await failing();

    const block = screen.getByRole("group", { name: "Удалить файл?" });
    const alert = within(block).getByRole("alert");
    expect(alert.textContent).toContain("Файл занят другим действием");
    expect(button("Да, удалить")).toHaveProperty("disabled", false);
    expect(button("Отмена")).toHaveProperty("disabled", false);
  });

  it("фокус уходит на строку ошибки: кнопка на время запроса была отключена и фокус с неё слетал", async () => {
    await failing();
    expect(focused()).toBe(screen.getByRole("alert"));
  });

  it("«Отмена» закрывает блок и стирает ошибку: при следующем открытии её нет", async () => {
    await failing();
    fireEvent.click(button("Отмена"));
    expect(screen.queryByRole("alert")).toBeNull();

    press(button("Удалить файл"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("повторное нажатие стирает старую ошибку до ответа", async () => {
    const task = deferred();
    const onConfirm = vi.fn().mockResolvedValueOnce({ error: "Не вышло" }).mockImplementationOnce(() => task.promise);
    render(<Simple onConfirm={onConfirm} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(button("Да, удалить"));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => task.resolve(undefined));
  });

  it("сбой сети (действие бросило): понятная фраза в блоке, блок открыт", async () => {
    render(<Simple onConfirm={async () => Promise.reject(new TypeError("fetch failed"))} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });

    expect(screen.getByRole("alert").textContent).toContain("нет связи с сервером");
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("ошибка формы родителя появилась, а фокус потерян (кнопка отправки была отключена): фокус уходит на строку ошибки", () => {
    function Host() {
      const [error, setError] = useState<string | null>(null);
      return (
        <div>
          <button onClick={() => setError("Для подтверждения впишите слово «удалить»")}>ответ сервера</button>
          <ConfirmBlock open onOpenChange={() => {}} question="Стереть?" confirmLabel="Стереть" error={error} onConfirm={() => {}} />
        </div>
      );
    }
    render(<Host />);
    // fireEvent.click фокус не двигает: он на <body>, как после отключённой кнопки отправки
    expect(focused()).toBe(document.body);
    fireEvent.click(screen.getByText("ответ сервера"));
    expect(screen.getByRole("alert").textContent).toContain("впишите слово");
    expect(focused()).toBe(screen.getByRole("alert"));
  });

  it("форма с action: после каждой неудачной отправки с потерянным фокусом он встаёт на ошибку — и при той же самой ошибке", async () => {
    function Host() {
      const [error, setError] = useState<string | null>(null);
      return (
        <ConfirmBlock
          open
          onOpenChange={() => {}}
          formProps={{
            action: async () => {
              await Promise.resolve();
              setError("Для подтверждения впишите слово «удалить»");
            },
          }}
          question="Стереть данные?"
          questionHidden
          confirmLabel="Стереть"
          error={error}
        >
          <input aria-label="Слово" name="word" />
        </ConfirmBlock>
      );
    }
    render(<Host />);

    await act(async () => {
      fireEvent.click(button("Стереть"));
    });
    expect(focused()).toBe(screen.getByRole("alert"));

    // Фокус снова потерян (кнопка отключалась на время отправки); ошибка та же, текст не изменился
    (focused() as HTMLElement).blur();
    expect(focused()).toBe(document.body);
    await act(async () => {
      fireEvent.click(button("Стереть"));
    });
    expect(focused()).toBe(screen.getByRole("alert"));
  });

  it("форма с action: фокус в поле при ответе с ошибкой остаётся в поле", async () => {
    render(
      <ConfirmBlock
        open
        onOpenChange={() => {}}
        formProps={{ action: async () => {} }}
        question="Стереть данные?"
        questionHidden
        confirmLabel="Стереть"
        error="Для подтверждения впишите слово «удалить»"
      >
        <input aria-label="Слово" name="word" />
      </ConfirmBlock>,
    );
    const field = screen.getByLabelText("Слово");
    field.focus();
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    expect(focused()).toBe(field);
  });

  it("ошибка снаружи, пока человек в поле (проверка «Напишите причину»): фокус не отбирается", async () => {
    function Host() {
      const [error, setError] = useState<string | null>(null);
      return (
        <ConfirmBlock open onOpenChange={() => {}} question="Отказ кандидату" questionHidden confirmLabel="Отклонить" error={error} onConfirm={() => { setError("Напишите причину"); return false; }}>
          <textarea aria-label="Текст причины" />
        </ConfirmBlock>
      );
    }
    render(<Host />);
    const field = screen.getByLabelText("Текст причины");
    field.focus();
    await act(async () => {
      fireEvent.click(button("Отклонить"));
    });
    expect(screen.getByRole("alert").textContent).toContain("Напишите причину");
    expect(focused()).toBe(field);
  });

  it("ошибка снаружи, что была с самого начала, фокус не двигает", () => {
    render(<ConfirmBlock open onOpenChange={() => {}} question="Отклонить?" confirmLabel="Отклонить" error="Напишите причину" onConfirm={() => {}} />);
    expect(focused()).toBe(document.body);
  });

  it("ошибка снаружи (проверка полей): рисуется в блоке, фокус не отбирает", () => {
    render(
      <ConfirmBlock
        open
        onOpenChange={() => {}}
        question="Отклонить?"
        confirmLabel="Отклонить"
        error="Напишите причину"
        onConfirm={() => {}}
      />,
    );
    expect(within(screen.getByRole("group")).getByRole("alert").textContent).toContain("Напишите причину");
    expect(focused()).not.toBe(screen.getByRole("alert"));
  });
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>граница ошибок</p> : this.props.children;
  }
}

describe("«страница устарела» не глотается", () => {
  it("UnrecognizedActionError уходит в границу ошибок, а не в «нет связи»", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <Simple onConfirm={async () => Promise.reject(new UnrecognizedActionError("Server Action not found"))} />
      </Boundary>,
    );
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });

    expect(await screen.findByText("граница ошибок")).toBeTruthy();
    expect(screen.queryByText(/нет связи/)).toBeNull();
  });
});

describe("вид", () => {
  it("по умолчанию «Да» опасная (destructive), «Отмена» тихая (ghost), размер sm", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    expect(button("Да, удалить").getAttribute("data-variant")).toBe("destructive");
    expect(button("Да, удалить").getAttribute("data-size")).toBe("sm");
    expect(button("Отмена").getAttribute("data-variant")).toBe("ghost");
    expect(button("Отмена").getAttribute("data-size")).toBe("sm");
  });

  it("обратимое действие — не красное: confirmVariant задаёт вызывающий", () => {
    render(<Simple confirmVariant="outline" cancelVariant="outline" size="default" />);
    press(button("Удалить файл"));
    expect(button("Да, удалить").getAttribute("data-variant")).toBe("outline");
    expect(button("Отмена").getAttribute("data-variant")).toBe("outline");
    expect(button("Да, удалить").getAttribute("data-size")).toBe("default");
    // «Отмена» того же размера, что и «Да»: пара кнопок не должна быть разной высоты
    expect(button("Отмена").getAttribute("data-size")).toBe("default");
  });

  it("layout=inline: вопрос — строчный span, не абзац; compact даёт мелкий текст", () => {
    render(<Simple layout="inline" compact />);
    press(button("Удалить файл"));
    const question = screen.getByText("Удалить файл?");
    expect(question.tagName).toBe("SPAN");
    expect(question.className).not.toContain("text-sm");
    expect(screen.getByRole("group").className).toContain("text-xs");
  });

  it("layout=stack: вопрос — абзац с text-sm", () => {
    render(<Simple />);
    press(button("Удалить файл"));
    const question = screen.getByText("Удалить файл?");
    expect(question.tagName).toBe("P");
    expect(question.className).toContain("text-sm");
  });

  it("ошибка в строке списка — строкой, в блоке-абзаце — плашкой; errorLine меняет выбор", async () => {
    const failing = async () => ({ error: "Не вышло" });
    const { unmount } = render(<Simple layout="inline" onConfirm={failing} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });
    expect(screen.getByRole("alert").tagName).toBe("P");
    unmount();

    render(<Simple onConfirm={failing} />);
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Да, удалить"));
    });
    expect(screen.getByRole("alert").getAttribute("data-slot")).toBe("alert");
  });
});

describe("кнопка стоит в другом месте: open, onOpenChange и triggerRef у родителя", () => {
  function Parent({ hidden = true }: { hidden?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <Button ref={ref} type="button" onClick={() => setOpen(true)}>
          Отказать
        </Button>
        <ConfirmBlock
          open={open}
          onOpenChange={setOpen}
          triggerRef={ref}
          questionHidden={hidden}
          question="Отказ кандидату: укажите причину"
          confirmLabel="Отказать"
          onConfirm={() => {}}
        >
          <textarea aria-label="Причина" />
        </ConfirmBlock>
      </div>
    );
  }

  it("закрыт — ничего не рисует; кнопка родителя остаётся на месте", () => {
    render(<Parent />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(button("Отказать")).toBeTruthy();
  });

  it("открытие: фокус на первое поле, а не на «Отмену»; вопрос только для читалки, но группа им названа", () => {
    render(<Parent />);
    press(button("Отказать"));

    const block = screen.getByRole("group", { name: "Отказ кандидату: укажите причину" });
    expect(focused()).toBe(within(block).getByLabelText("Причина"));
    expect(screen.getByText("Отказ кандидату: укажите причину").className).toContain("sr-only");
  });

  it("вопрос на экране (questionHidden=false) — видимый абзац, а не sr-only", () => {
    render(<Parent hidden={false} />);
    press(button("Отказать"));
    expect(screen.getByText("Отказ кандидату: укажите причину").className).not.toContain("sr-only");
  });

  it("«Отмена» и Escape возвращают фокус на кнопку родителя", () => {
    render(<Parent />);
    press(button("Отказать"));
    fireEvent.click(button("Отмена"));
    expect(focused()).toBe(button("Отказать"));

    press(button("Отказать"));
    fireEvent.keyDown(focused()!, { key: "Escape" });
    expect(focused()).toBe(button("Отказать"));
  });
});

describe("форма внутри блока (причина, слово-подтверждение)", () => {
  function FormParent({ pending = false, onSubmit = vi.fn() }: { pending?: boolean; onSubmit?: (e: unknown) => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmBlock
        open={open}
        onOpenChange={setOpen}
        formProps={{
          onSubmit: (e) => {
            e.preventDefault();
            onSubmit(e);
          },
        }}
        question="Почему отменяете?"
        questionFor="reason"
        confirmLabel="Отменить заявку"
        pendingLabel="Отменяем…"
        confirmVariant="outline"
        pending={pending}
      >
        <input id="reason" name="reason" />
      </ConfirmBlock>
    );
  }

  it("это <form>, названная вопросом; вопрос — подпись поля (label for)", () => {
    render(<FormParent />);
    const form = screen.getByRole("form", { name: "Почему отменяете?" });
    expect(within(form).getByLabelText("Почему отменяете?")).toBe(within(form).getByRole("textbox"));
  });

  it("кнопка подтверждения — отправка формы, и форма уходит", () => {
    const onSubmit = vi.fn();
    render(<FormParent onSubmit={onSubmit} />);
    const submit = button("Отменить заявку");
    expect(submit.getAttribute("type")).toBe("submit");
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("идёт отправка формы (pending): подтверждение с индикатором, «Отмена» заблокирована, Escape не закрывает", () => {
    render(<FormParent pending />);
    expect(button("Отменяем…").getAttribute("data-loading")).toBe("true");
    expect(button("Отмена")).toHaveProperty("disabled", true);
    fireEvent.keyDown(screen.getByRole("form"), { key: "Escape" });
    expect(screen.getByRole("form")).toBeTruthy();
  });
});

describe("второе действие рядом с «Да»", () => {
  it("«Сохранить и закрыть» проходит через тот же замок и то же ожидание, что «Да»", async () => {
    const extra = deferred();
    const onConfirm = vi.fn();
    const task = vi.fn(() => extra.promise);
    render(
      <Simple
        size="default"
        onConfirm={onConfirm}
        extraActions={<ConfirmExtraAction task={task}>Сохранить и закрыть</ConfirmExtraAction>}
      />,
    );
    press(button("Удалить файл"));
    expect(button("Сохранить и закрыть").getAttribute("data-size")).toBe("default");

    fireEvent.click(button("Сохранить и закрыть"));
    expect(button("Сохранить и закрыть")).toHaveProperty("disabled", true);
    // Индикатор у нажатой кнопки; «Да» рядом только заблокирована и подписи не меняет
    expect(button("Сохранить и закрыть").getAttribute("data-loading")).toBe("true");
    expect(button("Да, удалить")).toHaveProperty("disabled", true);
    expect(button("Да, удалить").getAttribute("data-loading")).toBeNull();
    fireEvent.click(button("Да, удалить"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);

    await act(async () => extra.resolve(undefined));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("пока идёт «Да», «Сохранить и закрыть» заблокирована, но индикатора у неё нет", async () => {
    const task = deferred();
    render(
      <Simple
        onConfirm={() => task.promise}
        extraActions={<ConfirmExtraAction task={vi.fn()}>Сохранить и закрыть</ConfirmExtraAction>}
      />,
    );
    press(button("Удалить файл"));
    fireEvent.click(button("Да, удалить"));

    expect(button("Сохранить и закрыть")).toHaveProperty("disabled", true);
    expect(button("Сохранить и закрыть").getAttribute("data-loading")).toBeNull();
    expect(button("Удаляем…").getAttribute("data-loading")).toBe("true");
    await act(async () => task.resolve(undefined));
  });

  it("ошибка второго действия показана в том же блоке", async () => {
    render(
      <Simple
        extraActions={<ConfirmExtraAction task={async () => ({ error: "Не сохранилось" })}>Сохранить и закрыть</ConfirmExtraAction>}
      />,
    );
    press(button("Удалить файл"));
    await act(async () => {
      fireEvent.click(button("Сохранить и закрыть"));
    });
    expect(within(screen.getByRole("group")).getByRole("alert").textContent).toContain("Не сохранилось");
  });
});
