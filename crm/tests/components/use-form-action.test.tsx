// @vitest-environment jsdom
/**
 * useFormAction: форма с серверным действием не теряет набранное после отказа, ставит фокус на
 * первое неверное поле и показывает ошибку у самого поля.
 *
 * Сверка 11.10.2026: `<form action={formAction}>` в React 19 очищает неуправляемые поля после ЛЮБОГО
 * ответа, в том числе после отказа — «ИНН уже занят» стирал анкету, «пароли не совпадают» — всё введённое.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormMessage } from "@/components/ui/form-message";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";
import { useFormAction, type UseFormActionOptions } from "@/lib/hooks/use-form-action";

afterEach(cleanup);

type Action = (prev: FormState, data: FormData) => Promise<FormState>;

function Demo({ action, options }: { action: Action; options?: UseFormActionOptions }) {
  const { state, pending, formProps } = useFormAction(action, {}, options);
  return (
    <form {...formProps} aria-label="Форма" className="space-y-4">
      <Field label="Имя" error={state.fields?.fullName}>
        <Input name="fullName" required />
      </Field>
      <Field label="Почта" error={state.fields?.email}>
        <Input name="email" type="email" />
      </Field>
      <Field label="Пароль">
        <Input name="password" type="password" />
      </Field>
      <SubmitButton loading={pending} pendingLabel="Сохраняем…">
        Сохранить
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

/** Контроль: прежний способ, `action={formAction}`, — именно он и стирал набранное. */
function Legacy({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} aria-label="Старая форма">
      <input aria-label="Имя" name="fullName" />
      <button type="submit">Отправить</button>
      <p>{state.error}</p>
    </form>
  );
}

describe("useFormAction", () => {
  it("контроль: обычная форма с action={formAction} стирает набранное после отказа", async () => {
    const user = userEvent.setup();
    render(<Legacy action={async () => ({ error: "Отказ" })} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await screen.findByText("Отказ");
    expect(screen.getByLabelText("Имя")).toHaveValue("");
  });

  it("отказ сервера: введённое остаётся, ошибка стоит у поля, поле помечено неверным", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({
      error: "Проверьте заполнение полей",
      fields: { email: "Проверьте адрес почты" },
    }));
    render(<Demo action={action} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.type(screen.getByLabelText("Почта"), "не-почта");
    await user.type(screen.getByLabelText("Пароль"), "секрет");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    const email = await screen.findByLabelText("Почта");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription("Проверьте адрес почты");
    expect(screen.getByLabelText("Имя")).toHaveValue("Анна");
    expect(email).toHaveValue("не-почта");
    expect(screen.getByLabelText("Пароль")).toHaveValue("секрет");
    // Сводка над кнопкой объявляется
    expect(screen.getByRole("alert")).toHaveTextContent("Проверьте заполнение полей");
  });

  it("после отказа фокус уходит на первое неверное поле, а не остаётся на <body>", async () => {
    const user = userEvent.setup();
    render(
      <Demo
        action={async () => ({
          error: "Проверьте заполнение полей",
          fields: { fullName: "Укажите имя", email: "Проверьте адрес почты" },
        })}
      />,
    );
    await user.type(screen.getByLabelText("Почта"), "x");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(screen.getByLabelText("Имя")).toHaveFocus());
  });

  it("общая ошибка без полей: фокус на плашке с ошибкой", async () => {
    const user = userEvent.setup();
    render(<Demo action={async () => ({ error: "Недостаточно прав" })} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Имя")).toHaveValue("Анна");
  });

  it("успех: набранное остаётся (это сохранённые значения), сообщение объявляется как status", async () => {
    const user = userEvent.setup();
    render(<Demo action={async () => ({ ok: "Сохранено" })} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toHaveValue("Анна");
  });

  it("resetOnSuccess: форма создания очищается, пароль не висит в странице", async () => {
    const user = userEvent.setup();
    render(<Demo action={async () => ({ ok: "Создано" })} options={{ resetOnSuccess: true }} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.type(screen.getByLabelText("Пароль"), "секрет");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Создано");
    expect(screen.getByLabelText("Имя")).toHaveValue("");
    expect(screen.getByLabelText("Пароль")).toHaveValue("");
  });

  it("clearOnError не трогает поле, если отказ относится к другому полю", async () => {
    const user = userEvent.setup();
    render(
      <Demo
        action={async () => ({ error: "Проверьте заполнение полей", fields: { email: "Проверьте адрес почты" } })}
        options={{ clearOnError: ["password"] }}
      />,
    );
    await user.type(screen.getByLabelText("Пароль"), "секрет");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Проверьте адрес почты");
    expect(screen.getByLabelText("Пароль")).toHaveValue("секрет");
  });

  it("clearOnError: стирается поле, к которому относится отказ", async () => {
    const user = userEvent.setup();
    render(
      <Demo
        action={async () => ({ error: "Проверьте заполнение полей", fields: { password: "Пароль неверен" } })}
        options={{ clearOnError: ["password"] }}
      />,
    );
    await user.type(screen.getByLabelText("Пароль"), "секрет");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Проверьте заполнение полей");
    expect(screen.getByLabelText("Пароль")).toHaveValue("");
  });

  it("clearOnError: общий отказ без полей стирает перечисленное, остальное остаётся", async () => {
    const user = userEvent.setup();
    render(<Demo action={async () => ({ error: "Неверный пароль" })} options={{ clearOnError: ["password"] }} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.type(screen.getByLabelText("Пароль"), "секрет");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Пароль")).toHaveValue("");
    expect(screen.getByLabelText("Имя")).toHaveValue("Анна");
  });

  it("проверка браузера выключена: пустое required-поле не мешает дойти до сервера с русским текстом", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ error: "Проверьте заполнение полей", fields: { fullName: "Укажите имя" } }));
    render(<Demo action={action} />);
    expect(screen.getByRole("form", { name: "Форма" })).toHaveAttribute("novalidate");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Укажите имя")).toBeInTheDocument();
  });

  it("пока идёт отправка: кнопка в загрузке, статус для читалки; вторая отправка не стартует", async () => {
    let release!: (s: FormState) => void;
    const action = vi.fn<Action>(() => new Promise<FormState>((resolve) => (release = resolve)));
    const user = userEvent.setup();
    render(<Demo action={action} />);
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.type(screen.getByLabelText("Имя"), "{Enter}");
    const busy = await screen.findByRole("button", { name: "Сохраняем…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Отправляем…");
    // Ещё одна отправка (Enter в поле в обход кнопки) — игнорируется
    await user.type(screen.getByLabelText("Имя"), "{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: "Готово" }));
    expect(await screen.findByText("Готово")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it("после быстрого отказа форму можно отправить снова (защита от второй отправки не залипает)", async () => {
    const user = userEvent.setup();
    const action = vi
      .fn<Action>()
      .mockResolvedValueOnce({ error: "Проверьте заполнение полей", fields: { fullName: "Укажите имя" } })
      .mockResolvedValueOnce({ ok: "Готово" });
    render(<Demo action={action} />);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Укажите имя");
    await user.type(screen.getByLabelText("Имя"), "Анна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Готово")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("имя и значение нажатой кнопки доходят до действия", async () => {
    const seen: Array<string | null> = [];
    const action: Action = async (_prev, data) => {
      seen.push(data.get("intent") as string | null);
      return {};
    };
    function TwoButtons() {
      const { formProps } = useFormAction(action, {});
      return (
        <form {...formProps}>
          <input name="x" defaultValue="1" aria-label="x" />
          <SubmitButton name="intent" value="draft">
            Черновик
          </SubmitButton>
          <SubmitButton name="intent" value="send">
            Отправить
          </SubmitButton>
        </form>
      );
    }
    const user = userEvent.setup();
    render(<TwoButtons />);
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(seen).toEqual(["send"]));
  });
});
