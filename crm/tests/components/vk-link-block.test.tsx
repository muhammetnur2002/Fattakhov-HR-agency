// @vitest-environment jsdom
/**
 * Блок привязки ВКонтакте в настройках: получить код, дождаться сообщения,
 * отвязать, привязать снова.
 *
 * Главное, что здесь держится: кабинет сам замечает, что код дошёл (опрос
 * сервера), и не просит «проверить привязку» руками; отвязка спрашивает
 * подтверждение; код можно закрыть, и опрос после этого прекращается.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  issueVkLinkCodeAction: vi.fn(),
  unlinkVkAction: vi.fn(),
  vkLinkStatusAction: vi.fn(),
}));
vi.mock("@/app/actions/notifications", () => actions);

// Один и тот же объект на каждый вызов — как у настоящего useRouter,
// иначе опрос перезапускался бы на каждой отрисовке
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { VkLinkBlock } from "@/components/settings/vk-link-block";

const IN_15_MIN = () => new Date(Date.now() + 15 * 60_000).toISOString();

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  actions.issueVkLinkCodeAction.mockResolvedValue({ code: "042917", expiresAt: IN_15_MIN() });
  actions.unlinkVkAction.mockResolvedValue(undefined);
  actions.vkLinkStatusAction.mockResolvedValue({ status: "waiting", vkUserId: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

describe("состояния блока", () => {
  it("не привязан — только кнопка кода, отвязки нет", () => {
    render(<VkLinkBlock vkUserId={null} messageUrl="https://vk.me/club1" />);
    expect(screen.getByText(/ВКонтакте пока не привязан/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить код привязки" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отвязать" })).toBeNull();
  });

  it("привязан — видно, какая страница, и есть «заново» и «отвязать»", () => {
    render(<VkLinkBlock vkUserId="777" messageUrl="https://vk.me/club1" />);
    expect(screen.getByRole("link", { name: "vk.com/id777" })).toHaveAttribute(
      "href",
      "https://vk.com/id777",
    );
    expect(screen.getByRole("button", { name: "Привязать заново" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отвязать" })).toBeInTheDocument();
  });
});

describe("получение кода и ожидание сообщения", () => {
  it("показывает код, пошаговую инструкцию и ссылку сразу в чат с сообществом", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl="https://vk.me/club1" />);
    await click("Получить код привязки");

    expect(screen.getByLabelText("Код привязки: 042917")).toBeInTheDocument();
    // Ссылка ведёт в личные сообщения, а не на страницу сообщества
    expect(screen.getByRole("link", { name: "Открыть чат с сообществом" })).toHaveAttribute(
      "href",
      "https://vk.me/club1",
    );
    // Что делать — словами: куда писать, что нажать, что будет в ответ
    expect(screen.getByText(/Скопируйте код кнопкой рядом с цифрами/)).toBeInTheDocument();
    expect(screen.getByText(/личная\s+переписка с сообществом агентства/)).toBeInTheDocument();
    expect(screen.getByText(/Отправьте код в этот чат одним сообщением/)).toBeInTheDocument();
    expect(screen.getByText(/не на стене и не в комментариях/)).toBeInTheDocument();
  });

  it("кнопка копирования кладёт код в буфер и подтверждает «Скопировано»", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");
    await click("Скопировать код");

    expect(writeText).toHaveBeenCalledWith("042917");
    expect(screen.getByText("Скопировано")).toBeInTheDocument();

    // Через пару секунд подпись гаснет — кнопка снова готова
    await tick(2100);
    expect(screen.queryByText("Скопировано")).toBeNull();
  });

  it("без доступа к буферу пробует запасной способ, а если и он не вышел — говорит об этом", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const exec = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });

    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");
    await click("Скопировать код");

    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.queryByText("Скопировано")).toBeNull();
    expect(screen.getByText(/Не удалось скопировать/)).toBeInTheDocument();
  });

  it("опрашивает сервер и, когда код дошёл, сам убирает его и обновляет страницу", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");

    await tick(3000);
    expect(actions.vkLinkStatusAction).toHaveBeenCalledWith("042917");
    // Пока не написали — код на месте
    expect(screen.getByLabelText("Код привязки: 042917")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();

    actions.vkLinkStatusAction.mockResolvedValue({ status: "linked", vkUserId: "777" });
    await tick(3000);

    expect(screen.queryByLabelText("Код привязки: 042917")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Готово: страница ВКонтакте привязана.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("истёкший код убирается с понятным объяснением", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");

    actions.vkLinkStatusAction.mockResolvedValue({ status: "expired", vkUserId: null });
    await tick(3000);

    expect(screen.queryByLabelText("Код привязки: 042917")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Код больше не действует");
    expect(screen.getByRole("button", { name: "Получить код привязки" })).toBeInTheDocument();
  });

  it("«Отмена» закрывает код, и опрос прекращается", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");
    await click("Отмена");

    expect(screen.queryByLabelText("Код привязки: 042917")).toBeNull();
    await tick(10_000);
    expect(actions.vkLinkStatusAction).not.toHaveBeenCalled();
  });

  it("на фоновой вкладке не опрашивает", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");

    await tick(9000);
    expect(actions.vkLinkStatusAction).not.toHaveBeenCalled();
  });

  it("сбой сети при опросе не ломает блок — следующий опрос повторяет", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");

    actions.vkLinkStatusAction.mockRejectedValueOnce(new Error("network"));
    await tick(3000);
    expect(screen.getByLabelText("Код привязки: 042917")).toBeInTheDocument();

    actions.vkLinkStatusAction.mockResolvedValue({ status: "linked", vkUserId: "777" });
    await tick(3000);
    expect(screen.getByRole("status")).toHaveTextContent("Готово");
  });

  it("отказ выдать код показывается текстом, кода на экране нет", async () => {
    actions.issueVkLinkCodeAction.mockResolvedValue({ error: "ВКонтакте на сервере ещё не подключён." });
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");

    expect(screen.getByText("ВКонтакте на сервере ещё не подключён.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Код привязки/)).toBeNull();
  });

  it("«Привязать заново» у привязанного выдаёт новый код", async () => {
    render(<VkLinkBlock vkUserId="777" messageUrl={null} />);
    await click("Привязать заново");
    expect(screen.getByLabelText("Код привязки: 042917")).toBeInTheDocument();
  });
});

describe("отвязка", () => {
  it("сначала спрашивает; без подтверждения ничего не отвязывает", async () => {
    render(<VkLinkBlock vkUserId="777" messageUrl={null} />);
    await click("Отвязать");

    expect(screen.getByText(/Отвязать страницу\?/)).toBeInTheDocument();
    expect(actions.unlinkVkAction).not.toHaveBeenCalled();

    await click("Отмена");
    expect(actions.unlinkVkAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Привязать заново" })).toBeInTheDocument();
  });

  it("старое «Готово» не висит над вопросом об отвязке", async () => {
    render(<VkLinkBlock vkUserId={null} messageUrl={null} />);
    await click("Получить код привязки");
    actions.vkLinkStatusAction.mockResolvedValue({ status: "linked", vkUserId: "777" });
    await tick(3000);
    expect(screen.getByRole("status")).toHaveTextContent("Готово");
    cleanup();

    // После обновления страницы блок приходит уже с привязанной страницей
    render(<VkLinkBlock vkUserId="777" messageUrl={null} />);
    await click("Отвязать");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("после подтверждения отвязывает, обновляет страницу и сообщает, что можно привязать снова", async () => {
    render(<VkLinkBlock vkUserId="777" messageUrl={null} />);
    await click("Отвязать");
    await click("Да, отвязать");

    expect(actions.unlinkVkAction).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Страница отвязана");
  });
});
