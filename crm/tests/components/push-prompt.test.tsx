// @vitest-environment jsdom
/**
 * Плашка «Разрешите уведомления».
 *
 * Правило, ради которого она есть: при каждом заходе, пока устройство не
 * подписано, человек видит предложение. «Закрыть» убирает его до конца
 * визита, а навсегда — только с галочкой «Больше не показывать».
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  support: "supported" as string,
  subscription: null as { endpoint: string } | null,
  enable: vi.fn(),
}));

vi.mock("@/lib/notifications/push-client", () => ({
  pushSupport: () => push.support,
  isIos: () => false,
  isAndroid: () => false,
  endpointFingerprint: async (endpoint: string) => `fp:${endpoint}`,
  subscribedWithKey: () => true,
  enableThisDevice: push.enable,
  pushServiceText: () => "служба недоступна",
  PushServiceUnavailable: class extends Error {},
}));

import { PushPrompt } from "@/components/shell/push-prompt";

function mount(devices: string[] = []) {
  return render(<PushPrompt userId="u1" publicKey="key" devices={devices} />);
}

beforeEach(() => {
  push.support = "supported";
  push.subscription = null;
  push.enable.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("Notification", { permission: "default" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => push.subscription } }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("плашка уведомлений", () => {
  it("устройство не подписано — предлагает разрешить", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Разрешить уведомления" })).toBeInTheDocument();
  });

  it("устройство уже подписано у сервера — плашки нет", async () => {
    push.subscription = { endpoint: "https://push.example/abc" };
    mount(["fp:https://push.example/abc"]);
    await waitFor(() => expect(screen.queryByText(/уведомления от кабинета/i)).toBeNull());
  });

  it("подписка в браузере есть, а у сервера её за этим человеком нет — предлагает снова", async () => {
    push.subscription = { endpoint: "https://push.example/abc" };
    mount(["fp:чужое"]);
    expect(await screen.findByRole("button", { name: "Разрешить уведомления" })).toBeInTheDocument();
  });

  it("«Закрыть» прячет до конца визита, но не навсегда", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole("button", { name: "Разрешить уведомления" });
    await user.click(screen.getByRole("button", { name: "Закрыть до следующего захода" }));
    expect(screen.queryByRole("button", { name: "Разрешить уведомления" })).toBeNull();
    expect(localStorage.getItem("fhr-push-prompt:u1")).toBeNull();

    // тот же визит, страница открыта заново — плашки нет
    cleanup();
    mount();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Разрешить уведомления" })).toBeNull());

    // новый визит — снова предлагает
    cleanup();
    sessionStorage.clear();
    mount();
    expect(await screen.findByRole("button", { name: "Разрешить уведомления" })).toBeInTheDocument();
  });

  it("с галочкой «Больше не показывать» не появляется и в следующих визитах", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole("button", { name: "Разрешить уведомления" });
    await user.click(screen.getByLabelText("Больше не показывать"));
    await user.click(screen.getByRole("button", { name: "Закрыть и больше не показывать" }));
    expect(localStorage.getItem("fhr-push-prompt:u1")).toBe("never");

    cleanup();
    sessionStorage.clear();
    mount();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Разрешить уведомления" })).toBeNull());
  });

  it("отказ другого пользователя на этом устройстве не мешает", async () => {
    localStorage.setItem("fhr-push-prompt:u2", "never");
    mount();
    expect(await screen.findByRole("button", { name: "Разрешить уведомления" })).toBeInTheDocument();
  });

  it("нажали «Разрешить» — включает и показывает, что готово", async () => {
    const user = userEvent.setup();
    push.enable.mockResolvedValue({ kind: "done", result: { ok: "ok" }, endpoint: "https://push.example/abc" });
    mount();
    await user.click(await screen.findByRole("button", { name: "Разрешить уведомления" }));
    expect(push.enable).toHaveBeenCalledWith("key");
    expect(await screen.findByText("Уведомления включены")).toBeInTheDocument();
  });

  it("браузер запретил уведомления — вместо кнопки подсказка", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    mount();
    expect(await screen.findByText(/запрещены в настройках браузера/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Разрешить уведомления" })).toBeNull();
  });

  it("браузер не умеет уведомления вовсе — плашки нет", async () => {
    push.support = "unsupported";
    mount();
    await waitFor(() => expect(screen.queryByText(/уведомления от кабинета/i)).toBeNull());
  });
});
