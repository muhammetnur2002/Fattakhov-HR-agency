// @vitest-environment jsdom
/**
 * Кабинет клиента: профиль компании, удаление аккаунта, объяснение студенческой платформы,
 * подсказка «подберём сами», удаление закрытых вакансий и заявка на удаление аккаунта у агентства.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/students", push: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveCompanyProfileAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  cancelDeletionRequestAction: vi.fn(),
  deleteVacanciesAction: vi.fn(),
  vacancyActionAction: vi.fn(),
  decideAccountDeletionAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
}));
vi.mock("@/app/(client)/company/actions", () => ({ saveCompanyProfileAction: actions.saveCompanyProfileAction }));
vi.mock("@/app/(client)/settings/actions", () => ({
  deleteAccountAction: actions.deleteAccountAction,
  cancelDeletionRequestAction: actions.cancelDeletionRequestAction,
}));
vi.mock("@/app/actions/vacancies", () => ({ deleteVacanciesAction: actions.deleteVacanciesAction }));
vi.mock("@/app/(client)/students/actions", () => ({ vacancyActionAction: actions.vacancyActionAction }));
vi.mock("@/app/(agency)/a/clients/actions", () => ({ decideAccountDeletionAction: actions.decideAccountDeletionAction }));

import { CompanyProfileForm } from "@/components/client/company-profile-form";
import { StudentsIntro } from "@/components/client/students-intro";
import { StudentsNudge } from "@/components/client/students-nudge";
import { DeletionRequest } from "@/components/clients/deletion-request";
import { DeleteAccount } from "@/components/settings/delete-account";
import { DeleteVacancies } from "@/components/vacancies/delete-vacancies";
import { ClearClosed } from "@/app/(client)/students/clear-closed";

const memory = new Map<string, string>();
const storageStub = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
};

// next/link подгружает страницы по видимости ссылки; в jsdom такого наблюдателя нет
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("localStorage", storageStub);
  memory.clear();
  nav.pathname = "/students";
});
afterEach(cleanup);

const company = {
  id: "cl1",
  name: "Камская Логистика",
  legalName: null,
  inn: null,
  industry: "Логистика",
  city: "Набережные Челны",
  website: null,
  description: null,
  logoUrl: null,
};

describe("профиль компании", () => {
  it("администратор видит поля и кнопку «Сохранить»", () => {
    render(<CompanyProfileForm company={company} editable />);
    expect((screen.getByLabelText("Название компании") as HTMLInputElement).value).toBe("Камская Логистика");
    expect(screen.getByLabelText("ИНН")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить логотип" })).toBeInTheDocument();
  });

  it("остальные сотрудники читают: поля только для чтения, сохранить и логотип нельзя", () => {
    render(<CompanyProfileForm company={company} editable={false} />);
    expect((screen.getByLabelText("ИНН") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить логотип" })).not.toBeInTheDocument();
    expect(screen.getByText(/правит администратор/)).toBeInTheDocument();
  });

  it("ошибка про ИНН показана у поля, а введённое не стирается", async () => {
    actions.saveCompanyProfileAction.mockResolvedValue({
      error: "Этот ИНН уже указан у другой компании на студенческой платформе",
      fields: { inn: "Этот ИНН уже указан у другой компании" },
    });
    render(<CompanyProfileForm company={company} editable />);
    const inn = screen.getByLabelText("ИНН") as HTMLInputElement;
    await userEvent.type(inn, "1655000003");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Этот ИНН уже указан у другой компании")).toBeInTheDocument();
    expect(inn.value).toBe("1655000003");
    const sent = actions.saveCompanyProfileAction.mock.calls[0][1] as FormData;
    expect(sent.get("inn")).toBe("1655000003");
    expect(sent.get("name")).toBe("Камская Логистика");
  });

  it("успешное сохранение показывает подтверждение", async () => {
    actions.saveCompanyProfileAction.mockResolvedValue({ ok: "Профиль сохранён" });
    render(<CompanyProfileForm company={company} editable />);
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Профиль сохранён")).toBeInTheDocument();
  });

  it("логотип больше 4 МБ не отправляется", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<CompanyProfileForm company={company} editable />);
    const input = screen.getByLabelText("Файл логотипа");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(5 * 1024 * 1024)], "big.png", { type: "image/png" })] } });
    expect(await screen.findByText(/больше 4 МБ/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("удаление аккаунта клиентом", () => {
  it("без договора: объясняет, что удалится сразу, и удаляет после подтверждения", async () => {
    actions.deleteAccountAction.mockResolvedValue({ ok: "Аккаунт удалён" });
    render(<DeleteAccount contracted={false} requested={false} />);
    expect(screen.getByText(/удалится сразу и насовсем/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
    expect(actions.deleteAccountAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить аккаунт" }));
    await waitFor(() => expect(actions.deleteAccountAction).toHaveBeenCalledTimes(1));
  });

  it("с договором: только запрос владельцу", async () => {
    actions.deleteAccountAction.mockResolvedValue({ ok: "Запрос отправлен владельцу агентства." });
    render(<DeleteAccount contracted requested={false} />);
    expect(screen.getByText(/подтверждает владелец агентства/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить аккаунт" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Запросить удаление аккаунта" }));
    await userEvent.click(screen.getByRole("button", { name: "Да, отправить запрос" }));
    expect(await screen.findByText(/Запрос отправлен владельцу/)).toBeInTheDocument();
  });

  it("запрос уже отправлен: можно отозвать", async () => {
    actions.cancelDeletionRequestAction.mockResolvedValue({ ok: "Запрос снят" });
    render(<DeleteAccount contracted requested />);
    expect(screen.getByText(/Запрос на удаление отправлен владельцу/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отозвать запрос" }));
    await waitFor(() => expect(actions.cancelDeletionRequestAction).toHaveBeenCalledTimes(1));
  });

  it("можно передумать до подтверждения", async () => {
    render(<DeleteAccount contracted={false} requested={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(actions.deleteAccountAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Удалить аккаунт" })).toBeInTheDocument();
  });
});

describe("заявка на удаление аккаунта у агентства", () => {
  it("владелец подтверждает с вопросом и отклоняет сразу", async () => {
    actions.decideAccountDeletionAction.mockResolvedValue({ ok: "Аккаунт удалён" });
    render(<DeletionRequest userId="u1" clientId="cl1" canDecide />);
    expect(screen.getByText("Просит удалить аккаунт")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Подтвердить удаление" }));
    expect(actions.decideAccountDeletionAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(actions.decideAccountDeletionAction).toHaveBeenCalledWith("u1", "cl1", "confirm"));
  });

  it("отклонение уходит без лишних вопросов", async () => {
    actions.decideAccountDeletionAction.mockResolvedValue({ ok: "Запрос отклонён, клиент уведомлён" });
    render(<DeletionRequest userId="u1" clientId="cl1" canDecide />);
    await userEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(actions.decideAccountDeletionAction).toHaveBeenCalledWith("u1", "cl1", "reject"));
  });

  it("не владельцу решать нельзя: видит запрос, но кнопок нет", () => {
    render(<DeletionRequest userId="u1" clientId="cl1" canDecide={false} />);
    expect(screen.getByText("Просит удалить аккаунт")).toBeInTheDocument();
    expect(screen.getByText(/Решает владелец/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подтвердить удаление" })).not.toBeInTheDocument();
  });
});

describe("объяснение студенческой платформы", () => {
  it("в первый раз раскрыто, «Понятно» сворачивает и запоминает", async () => {
    const first = render(<StudentsIntro contracted={false} />);
    expect(screen.getByText("Что такое студенческая платформа")).toBeInTheDocument();
    expect(screen.getByText(/заполните профиль компании/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(screen.queryByText("Что такое студенческая платформа")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Как работает студенческая платформа/ })).toBeInTheDocument();

    first.unmount();
    render(<StudentsIntro contracted={false} />);
    expect(screen.queryByText("Что такое студенческая платформа")).not.toBeInTheDocument();
  });

  it("свёрнутое объяснение можно раскрыть снова", async () => {
    memory.set("students-intro-seen", "1");
    render(<StudentsIntro contracted={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Как работает студенческая платформа/ }));
    expect(screen.getByText("Что такое студенческая платформа")).toBeInTheDocument();
  });

  it("клиенту с договором говорит, что вакансии публикуются сразу", () => {
    render(<StudentsIntro contracted />);
    expect(screen.getByText(/публикуются сразу, без проверки/)).toBeInTheDocument();
  });

  it("на других страницах раздела не показывается", () => {
    nav.pathname = "/students/applications";
    render(<StudentsIntro contracted={false} />);
    expect(screen.queryByText("Что такое студенческая платформа")).not.toBeInTheDocument();
  });
});

describe("подсказка «подберём сами»", () => {
  it("при откликах предлагает договор и разговор", () => {
    render(<StudentsNudge kind="ready" applications={7} telegramHref="https://t.me/x" />);
    expect(screen.getByText(/7 откликов/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Оформить договор" })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: "Обсудить с нами" })).toHaveAttribute("href", "https://t.me/x");
  });

  it("закрытую подсказку этой ступени больше не показывает, а другую ступень показывает", async () => {
    const first = render(<StudentsNudge kind="responses" applications={2} telegramHref="#" />);
    await userEvent.click(screen.getByRole("button", { name: "Скрыть подсказку" }));
    expect(screen.queryByText(/Вам уже откликнулись студенты/)).not.toBeInTheDocument();
    first.unmount();

    render(<StudentsNudge kind="responses" applications={3} telegramHref="#" />);
    expect(screen.queryByText(/Вам уже откликнулись студенты/)).not.toBeInTheDocument();
    cleanup();

    render(<StudentsNudge kind="ready" applications={6} telegramHref="#" />);
    expect(screen.getByText(/6 откликов/)).toBeInTheDocument();
  });
});

describe("удаление закрытых вакансий", () => {
  it("одна вакансия: подтверждение, удаление и переход в список", async () => {
    actions.deleteVacanciesAction.mockResolvedValue({ deleted: 1 });
    render(<DeleteVacancies ids={["v1"]} label="Удалить вакансию" question="Удалить эту вакансию?" redirectTo="/vacancies" />);

    await userEvent.click(screen.getByRole("button", { name: /Удалить вакансию/ }));
    expect(actions.deleteVacanciesAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));

    await waitFor(() => expect(actions.deleteVacanciesAction).toHaveBeenCalledWith(["v1"]));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/vacancies"));
  });

  it("список: удаляет все закрытые и обновляет страницу", async () => {
    actions.deleteVacanciesAction.mockResolvedValue({ deleted: 3 });
    render(<DeleteVacancies ids={["a", "b", "c"]} label="Удалить закрытые (3)" question="Удалить закрытые (3)?" />);
    await userEvent.click(screen.getByRole("button", { name: /Удалить закрытые/ }));
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(actions.deleteVacanciesAction).toHaveBeenCalledWith(["a", "b", "c"]));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("ошибка прав показывается и переход не происходит", async () => {
    actions.deleteVacanciesAction.mockResolvedValue({ error: "Недостаточно прав" });
    render(<DeleteVacancies ids={["v1"]} label="Удалить вакансию" question="Удалить?" redirectTo="/vacancies" />);
    await userEvent.click(screen.getByRole("button", { name: /Удалить вакансию/ }));
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    expect(await screen.findByText("Недостаточно прав")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("вакансии студенческой платформы: удаляет по одной и сообщает, сколько не вышло", async () => {
    actions.vacancyActionAction.mockResolvedValueOnce({}).mockResolvedValueOnce({ error: "Вакансия опубликована" });
    render(<ClearClosed ids={["p1", "p2"]} />);
    await userEvent.click(screen.getByRole("button", { name: /Удалить снятые и отклонённые \(2\)/ }));
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));

    await waitFor(() => expect(actions.vacancyActionAction).toHaveBeenCalledTimes(2));
    expect(actions.vacancyActionAction).toHaveBeenNthCalledWith(1, "p1", "delete");
    expect(await screen.findByText(/Не удалось удалить: 1/)).toBeInTheDocument();
  });
});
