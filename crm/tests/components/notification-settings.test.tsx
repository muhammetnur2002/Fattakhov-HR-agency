// @vitest-environment jsdom
/**
 * Форма настроек уведомлений: какие каналы на ней видны.
 *
 * Правило одно для всех каналов: обещать можно только то, что сервер
 * в состоянии отправить. Галочка канала, который ничего не может
 * доставить, — то, с чем полдня разбираются: человек видит «включено»
 * и ждёт. Поэтому поле ВК появляется только при ключе сообщества
 * на сервере. С пушем так же: блок есть, только когда на сервере заданы ключи VAPID.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/notifications", () => ({
  saveNotifySettingsAction: vi.fn(),
  issueVkLinkCodeAction: vi.fn(),
  unlinkVkAction: vi.fn(),
  vkLinkStatusAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/actions/push", () => ({
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
  removeOtherPushDevicesAction: vi.fn(),
}));

import { NotificationSettings } from "@/components/settings/notification-settings";

function renderForm(
  configured: { email: boolean; vk?: boolean },
  extra: Partial<React.ComponentProps<typeof NotificationSettings>> = {},
) {
  render(
    <NotificationSettings
      email
      channelsConfigured={configured}
      categories={{}}
      {...extra}
    />,
  );
}

describe("ВКонтакте в настройках", () => {
  it("без ключа сообщества на сервере блока ВК нет вовсе", () => {
    renderForm({ email: true, vk: false });
    expect(screen.queryByText("ВКонтакте")).toBeNull();
    expect(screen.queryByRole("button", { name: "Получить код привязки" })).toBeNull();
  });

  it("с ключом — кнопка кода и никакого поля для адреса страницы", () => {
    renderForm({ email: true, vk: true }, { vkUserId: null, vkMessageUrl: "https://vk.me/club123" });
    expect(screen.getByRole("button", { name: "Получить код привязки" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ваша страница ВКонтакте")).toBeNull();
    expect(screen.getByText(/ВКонтакте пока не привязан/)).toBeInTheDocument();
  });

  it("привязанный аккаунт показывает статус и отвязку", () => {
    renderForm({ email: true, vk: true }, { vkUserId: "777", vkMessageUrl: "https://vk.me/club123" });
    expect(screen.getByRole("link", { name: "vk.com/id777" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отвязать" })).toBeInTheDocument();
  });
});

describe("Telegram в настройках", () => {
  it("Telegram-бота в настройках больше нет — ни галочки, ни привязки", () => {
    renderForm({ email: true, vk: true });
    expect(screen.queryByText(/Telegram/)).toBeNull();
    expect(screen.queryByLabelText(/идентификатор чата/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Подключить Telegram/ })).toBeNull();
  });
});

describe("предупреждение о неподключённых каналах", () => {
  it("почта не подключена, ВК есть — предупреждение только про почту", () => {
    renderForm({ email: false, vk: true });
    expect(screen.getByText(/Почтовый сервер ещё не подключён/)).toBeInTheDocument();
  });

  it("не подключено ничего — сказано, что уведомления видны только в интерфейсе", () => {
    renderForm({ email: false, vk: false });
    expect(screen.getByText(/Почта и ВКонтакте ещё не подключены/)).toBeInTheDocument();
  });

  it("почта подключена — предупреждения нет", () => {
    renderForm({ email: true, vk: false });
    expect(screen.queryByText(/ещё не подключен/)).toBeNull();
  });
});

describe("уведомления на устройства", () => {
  it("без ключей VAPID на сервере блока нет вовсе", () => {
    renderForm({ email: true }, { pushPublicKey: null });
    expect(screen.queryByText("Уведомления на это устройство")).toBeNull();
    expect(screen.queryByLabelText(/Уведомления на телефон и компьютер/)).toBeNull();
  });

  it("с ключами — общая галочка и блок этого устройства", () => {
    const { container } = render(
      <NotificationSettings
        email
        channelsConfigured={{ email: true }}
        categories={{}}
        push={false}
        pushPublicKey="BPublicKeyForTests"
        pushDevices={[]}
      />,
    );
    expect(screen.getByText("Уведомления на это устройство")).toBeInTheDocument();
    // Снятая и сохранённая галочка так и показывается
    expect(screen.getByLabelText(/Уведомления на телефон и компьютер/)).not.toBeChecked();
    // По скрытому полю действие узнаёт, что галочка была в форме
    expect(container.querySelector('input[type="hidden"][name="pushInForm"]')).not.toBeNull();
  });
});
