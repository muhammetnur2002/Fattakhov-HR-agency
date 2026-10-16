// @vitest-environment jsdom
/**
 * Отзыв приглашения — ОДНИМ нажатием, без вопроса (решение владельца, 16.10.2026).
 *
 * С 13.10 «Отозвать» переспрашивала через ConfirmBlock («Отозвать приглашение? Ссылка перестанет работать.» →
 * «Да, отозвать» / «Отмена»). Прежнее поведение возвращено: действие обратимо — приглашение создаётся заново. Три экрана
 * (страница клиента у агентства, «Сотрудники», настройки клиента) рисуют один и тот же компонент.
 *
 * Что оставлено полезным от переработки подтверждений: ход запроса на кнопке, защита от двойного нажатия, ошибка
 * рядом с кнопкой, фокус на ней после отказа. Живая проверка с настоящим сервером и базой —
 * tests/e2e/confirm-block.spec.ts («отзыв приглашения: одно нажатие отзывает»).
 */
import { Component, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RevokeInviteButton, type RevokeInviteState } from "@/components/settings/revoke-invite-button";

afterEach(cleanup);

const button = (name: string | RegExp) => screen.getByRole("button", { name });

function view(action = vi.fn(async (): Promise<RevokeInviteState> => ({})), props: { clientId?: string } = { clientId: "cl1" }) {
  render(<RevokeInviteButton action={action} id="inv1" {...props} />);
  return action;
}

const sentForm = (action: ReturnType<typeof vi.fn>) => (action.mock.calls[0] as unknown as [unknown, FormData])[1];

describe("отзыв приглашения: одно нажатие", () => {
  it("первое же нажатие «Отозвать» отправляет действие — вопроса и «Да, отозвать» нет", async () => {
    const action = view();
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Отозвать приглашение\?/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Да, отозвать" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отмена" })).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("форма уходит с номером приглашения и компанией (агентство); в кабинете клиента компании в форме нет", async () => {
    const action = view();
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    const data = sentForm(action);
    expect(data.get("id")).toBe("inv1");
    expect(data.get("clientId")).toBe("cl1");

    cleanup();
    const own = view(vi.fn(async (): Promise<RevokeInviteState> => ({})), {});
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    const ownData = sentForm(own);
    expect(ownData.get("id")).toBe("inv1");
    expect(ownData.has("clientId"), "компанию в кабинете клиента берёт сервер из актора, форма её не несёт").toBe(false);
  });

  it("кнопка на время запроса подписана «Отзываем…», заблокирована, и второе нажатие действие не повторяет", async () => {
    let finish: (state: RevokeInviteState) => void = () => {};
    const action = vi.fn(() => new Promise<RevokeInviteState>((resolve) => (finish = resolve)));
    view(action);
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    const busy = button(/Отзываем/);
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(busy);
      fireEvent.submit(busy.closest("form")!);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish({}));
    expect(button("Отозвать")).toBeTruthy();
  });

  it("отказ сервера — строкой рядом с кнопкой, фокус на ней; кнопка снова доступна для повтора", async () => {
    const action = view(vi.fn(async (): Promise<RevokeInviteState> => ({ error: "Приглашение уже принято" })));
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Приглашение уже принято");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    // Строка стоит в той же форме, что и кнопка: к какому приглашению отказ — видно по месту
    expect(alert.closest("form")).toBe(button("Отозвать").closest("form"));
    expect((button("Отозвать") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button("Отозвать"));
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("сбой действия (сеть, «страница устарела») не глотается: исключение доходит до границы ошибок", async () => {
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? <p>граница ошибок сработала</p> : this.props.children;
      }
    }
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const action = vi.fn(async (): Promise<RevokeInviteState> => {
        throw new Error("Failed to fetch");
      });
      render(
        <Boundary>
          <RevokeInviteButton action={action} id="inv1" />
        </Boundary>,
      );
      await act(async () => {
        fireEvent.click(button("Отозвать"));
      });
      await waitFor(() => expect(screen.getByText("граница ошибок сработала")).toBeTruthy());
    } finally {
      quiet.mockRestore();
    }
  });
});
