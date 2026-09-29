// @vitest-environment jsdom
/**
 * Экраны клиента без договора: загрузка подписанного договора, замки на разделах
 * агентства, плашка про условия и управление шаблоном у владельца.
 *
 * Сервисы покрыты отдельно (tests/contract-documents.test.ts); здесь то, что видит
 * человек: что кнопка делает, какое сообщение появляется, что закрыто и что нет.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/documents" }));
const actions = vi.hoisted(() => ({
  uploadSignedContractAction: vi.fn(),
  uploadContractTemplateAction: vi.fn(),
  deleteContractTemplateAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(client)/documents/actions", () => ({
  uploadSignedContractAction: actions.uploadSignedContractAction,
}));
vi.mock("@/app/(agency)/a/clients/actions", () => ({
  uploadContractTemplateAction: actions.uploadContractTemplateAction,
  deleteContractTemplateAction: actions.deleteContractTemplateAction,
}));

import { ContractTemplateManager } from "@/components/clients/contract-template-manager";
import { ContractUpload } from "@/components/client/contract-upload";
import { ContractGate } from "@/components/client/contract-gate";
import { CooperationBanner } from "@/components/client/cooperation-banner";

const TG = "https://t.me/example";

/**
 * Отправка формы событием: в jsdom обязательное файловое поле считается пустым, даже когда файл
 * выбран, и кнопка «Отправить» из-за этого не срабатывает — в браузере такого нет.
 */
function submit(field: HTMLElement) {
  const form = field.closest("form");
  if (!form) throw new Error("поле вне формы");
  fireEvent.submit(form);
}

// В jsdom этой версии localStorage недоступен без адреса страницы — подставляем простой аналог
const memory = new Map<string, string>();
const storageStub = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", storageStub);
  memory.clear();
  pathname.current = "/documents";
});
afterEach(cleanup);

describe("загрузка подписанного договора", () => {
  it("отправляет файл и показывает подтверждение", async () => {
    actions.uploadSignedContractAction.mockResolvedValue({ ok: "Договор отправлен. Агентство проверит его и подтвердит." });
    render(<ContractUpload />);

    const file = new File(["%PDF-1.4"], "dogovor.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Подписанный договор"), file);
    submit(screen.getByLabelText("Подписанный договор"));

    expect(await screen.findByText(/Договор отправлен/)).toBeInTheDocument();
    expect(actions.uploadSignedContractAction).toHaveBeenCalledTimes(1);
    // Содержимое файла в FormData jsdom не переносит; важно, что действие получило именно форму
    expect(actions.uploadSignedContractAction.mock.calls[0][1]).toBeInstanceOf(FormData);
  });

  it("показывает ошибку сервера как есть", async () => {
    actions.uploadSignedContractAction.mockResolvedValue({ error: "Прислать договор может администратор компании" });
    render(<ContractUpload />);
    await userEvent.upload(
      screen.getByLabelText("Подписанный договор"),
      new File(["x"], "scan.png", { type: "image/png" }),
    );
    submit(screen.getByLabelText("Подписанный договор"));
    expect(await screen.findByText("Прислать договор может администратор компании")).toBeInTheDocument();
  });

  it("файл больше 4 МБ блокирует отправку ещё в браузере", async () => {
    render(<ContractUpload />);
    const input = screen.getByLabelText("Подписанный договор") as HTMLInputElement;
    const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [big] } });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toMatch(/4 МБ/);

    const small = new File(["ok"], "small.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [small] } });
    expect(input.validity.customError).toBe(false);
  });
});

describe("замок на разделах агентства", () => {
  it("без договора закрытый раздел размыт, а причина и кнопка на виду", () => {
    pathname.current = "/candidates";
    render(
      <ContractGate state="none" telegramHref={TG}>
        <p>Содержимое раздела</p>
      </ContractGate>,
    );
    expect(screen.getByText("Раздел откроется после договора")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Договор в «Документах»/ })).toHaveAttribute("href", "/documents");
    // Содержимое остаётся под размытием и недоступно для нажатий и чтения с экрана
    const content = screen.getByText("Содержимое раздела");
    expect(content.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("«Документы» и студенческая платформа не закрыты", () => {
    for (const path of ["/documents", "/students", "/settings", "/dashboard"]) {
      cleanup();
      pathname.current = path;
      render(
        <ContractGate state="none" telegramHref={TG}>
          <p>Открытый раздел</p>
        </ContractGate>,
      );
      expect(screen.queryByText("Раздел откроется после договора")).not.toBeInTheDocument();
      expect(screen.getByText("Открытый раздел")).toBeInTheDocument();
    }
  });

  it("«Сообщения» с командой закрыты вместо «Документов»", () => {
    pathname.current = "/messages";
    render(
      <ContractGate state="none" telegramHref={TG}>
        <p>Переписка</p>
      </ContractGate>,
    );
    expect(screen.getByText("Раздел откроется после договора")).toBeInTheDocument();
  });

  it("ждём подтверждения: другой текст и без кнопки выбора тарифа", () => {
    pathname.current = "/analytics";
    render(
      <ContractGate state="pending" telegramHref={TG}>
        <p>Отчёты</p>
      </ContractGate>,
    );
    expect(screen.getByText("Ждём подтверждения договора")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Выбрать тариф" })).not.toBeInTheDocument();
  });

  it("с действующим договором ничего не закрыто", () => {
    pathname.current = "/vacancies";
    render(
      <ContractGate state="active" telegramHref={TG}>
        <p>Вакансии клиента</p>
      </ContractGate>,
    );
    expect(screen.queryByText("Раздел откроется после договора")).not.toBeInTheDocument();
    expect(screen.getByText("Вакансии клиента")).toBeInTheDocument();
  });
});

describe("плашка про условия сотрудничества", () => {
  it("на открытой странице закрывается и больше не возвращается", async () => {
    pathname.current = "/students";
    const { unmount } = render(<CooperationBanner state="none" telegramHref={TG} />);
    expect(screen.getByText("Условия сотрудничества ещё не выбраны")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Скрыть" }));
    expect(screen.queryByText("Условия сотрудничества ещё не выбраны")).not.toBeInTheDocument();

    unmount();
    render(<CooperationBanner state="none" telegramHref={TG} />);
    expect(screen.queryByText("Условия сотрудничества ещё не выбраны")).not.toBeInTheDocument();
  });

  it("на закрытой странице стоит всегда и крестика нет", () => {
    localStorage.setItem("coop-banner-dismissed", "none");
    pathname.current = "/calendar";
    render(<CooperationBanner state="none" telegramHref={TG} />);
    expect(screen.getByText("Условия сотрудничества ещё не выбраны")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скрыть" })).not.toBeInTheDocument();
  });
});

describe("шаблон договора у владельца", () => {
  const current = { fileName: "dogovor.docx", uploadedAt: "29 сентября 2026 г.", url: "/signed/dogovor" };

  it("показывает текущий файл со ссылкой", () => {
    render(<ContractTemplateManager current={current} />);
    expect(screen.getByRole("link", { name: /dogovor\.docx/ })).toHaveAttribute("href", "/signed/dogovor");
    expect(screen.getByRole("button", { name: "Заменить шаблон" })).toBeInTheDocument();
  });

  it("без шаблона предлагает загрузить", () => {
    render(<ContractTemplateManager current={null} />);
    expect(screen.getByText(/Шаблона нет/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить шаблон" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Удалить/ })).not.toBeInTheDocument();
  });

  it("удаление просит подтверждения и только потом удаляет", async () => {
    actions.deleteContractTemplateAction.mockResolvedValue({ ok: "Шаблон удалён" });
    render(<ContractTemplateManager current={current} />);

    await userEvent.click(screen.getByRole("button", { name: /Удалить/ }));
    expect(actions.deleteContractTemplateAction).not.toHaveBeenCalled();
    expect(screen.getByText("Удалить шаблон?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(actions.deleteContractTemplateAction).toHaveBeenCalledTimes(1));
  });

  it("можно передумать: «Оставить» не удаляет", async () => {
    render(<ContractTemplateManager current={current} />);
    await userEvent.click(screen.getByRole("button", { name: /Удалить/ }));
    await userEvent.click(screen.getByRole("button", { name: "Оставить" }));
    expect(actions.deleteContractTemplateAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Удалить шаблон?")).not.toBeInTheDocument();
  });

  it("замена отправляет выбранный файл", async () => {
    actions.uploadContractTemplateAction.mockResolvedValue({ ok: "Шаблон обновлён — клиенты уже видят новый файл" });
    render(<ContractTemplateManager current={current} />);
    await userEvent.upload(
      screen.getByLabelText("Заменить новым файлом"),
      new File(["%PDF-1.4"], "new.pdf", { type: "application/pdf" }),
    );
    submit(screen.getByLabelText("Заменить новым файлом"));
    expect(await screen.findByText(/Шаблон обновлён/)).toBeInTheDocument();
    expect(actions.uploadContractTemplateAction).toHaveBeenCalledTimes(1);
    expect(actions.uploadContractTemplateAction.mock.calls[0][1]).toBeInstanceOf(FormData);
  });
});
