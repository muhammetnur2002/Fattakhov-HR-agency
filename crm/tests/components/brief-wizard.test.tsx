// @vitest-environment jsdom
/**
 * Анкета после регистрации — по одному вопросу на экран.
 *
 * Решение заказчика 24.09.2026 (CRM агентства). Тест держит то, что делает анкету
 * анкетой, а не длинной формой: на экране всегда один вопрос, шаги
 * сменяются без перезагрузки и без запроса к серверу, «Назад» не теряет
 * ответов, а на сервер всё уходит одним вызовом в самом конце.
 *
 * Анимация здесь выключена (skipAnimations): в jsdom нет кадров,
 * и проверять её тут нечем — сам сдвиг смотрится в браузере.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { completeBriefAction, replace } = vi.hoisted(() => ({
  completeBriefAction: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/app/(onboarding)/onboarding/actions", () => ({ completeBriefAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace }),
}));

import { BriefWizard } from "@/components/onboarding/brief-wizard";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

beforeEach(() => {
  completeBriefAction.mockReset();
  completeBriefAction.mockResolvedValue({ ok: true });
  replace.mockReset();
  sessionStorage.clear();
});

// Черновик кэшируется по id пользователя на весь модуль —
// у каждого теста свой id, чтобы ответы одного не всплывали в другом
let seq = 0;
function renderWizard(
  props: Partial<{ initial: Record<string, string>; needsPhone: boolean; needsEmail: boolean }> = {},
  userId = `u-${++seq}`,
) {
  const view = render(
    <BriefWizard
      userId={userId}
      initial={props.initial ?? {}}
      needsPhone={props.needsPhone ?? false}
      needsEmail={props.needsEmail ?? false}
    />,
  );
  return { ...view, userId };
}

const question = (name: string) => screen.findByRole("heading", { name });

// По роли, а не по подписи: форма шага подписана вопросом
// (aria-labelledby), и у «Ваша должность» вопрос и поле называются одинаково
const field = (label: string) => screen.getByRole("textbox", { name: label });

function answer(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

async function next(expected: string) {
  fireEvent.click(screen.getByRole("button", { name: "Далее" }));
  await question(expected);
}

async function skip(expected: string) {
  fireEvent.click(screen.getByRole("button", { name: "Пропустить" }));
  await question(expected);
}

describe("анкета после регистрации: по одному вопросу", () => {
  it("на экране один вопрос и одно поле, а не вся форма", () => {
    renderWizard();

    expect(screen.getByRole("heading", { name: "Как называется компания?" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByText("Кого ищете?")).not.toBeInTheDocument();
    expect(screen.getByText(/Шаг 1 из 6/)).toBeInTheDocument();
    // «Назад» на первом шаге некуда — но место под кнопку держится
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
  });

  it("обязательный вопрос не пускает дальше пустым и объясняет почему", async () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Укажите название компании");
    expect(screen.getByRole("heading", { name: "Как называется компания?" })).toBeInTheDocument();
    expect(completeBriefAction).not.toHaveBeenCalled();
  });

  it("вперёд и назад без запросов к серверу, ответы не теряются", async () => {
    renderWizard();

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await question("Как называется компания?");

    expect(field("Компания")).toHaveValue("Ромашка");
    expect(completeBriefAction).not.toHaveBeenCalled();
  });

  it("телефон и почту спрашивает только у тех, у кого их нет", async () => {
    const { unmount } = renderWizard({ needsPhone: false, needsEmail: false });
    expect(screen.getByText(/Шаг 1 из 6/)).toBeInTheDocument();
    unmount();

    renderWizard({ needsPhone: true, needsEmail: true });
    expect(screen.getByText(/Шаг 1 из 8/)).toBeInTheDocument();

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");
    answer("ФИО", "Анна Смирнова");
    await next("Ваша должность");
    await skip("Телефон для связи");

    answer("Телефон", "12345");
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Проверьте номер");

    answer("Телефон", "+7 900 123-45-67");
    await next("Рабочая почта");
  });

  it("имя, уже известное из учётки, подставлено, но его можно поправить", async () => {
    renderWizard({ initial: { name: "Анна" } });

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");

    expect(field("ФИО")).toHaveValue("Анна");
  });

  it("ответы уходят на сервер одним вызовом в самом конце", async () => {
    renderWizard();

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");
    answer("ФИО", "Анна Смирнова");
    await next("Ваша должность");
    // Начал писать и передумал: «Пропустить» не отправляет начатое
    answer("Ваша должность", "HR-дир");
    await skip("Кого ищете?");
    answer("Должность", "Руководитель отдела продаж");
    await next("В каком городе?");
    answer("Город", "Казань");
    await next("Какая вилка зарплаты?");
    answer("От, ₽", "150 000");
    answer("До, ₽", "200 000");

    expect(completeBriefAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(await screen.findByText("Спасибо!")).toBeInTheDocument();
    expect(completeBriefAction).toHaveBeenCalledTimes(1);
    const sent = completeBriefAction.mock.calls[0][0];
    expect(sent).toMatchObject({
      company: "Ромашка",
      name: "Анна Смирнова",
      vacancyTitle: "Руководитель отдела продаж",
      city: "Казань",
      salaryFrom: "150 000",
      salaryTo: "200 000",
    });
    expect(sent).not.toHaveProperty("position");
    // Дальше — кабинет: условия выбираются там, анкета к ним не принуждает
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("вилка наоборот не уходит на сервер", async () => {
    renderWizard();

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");
    answer("ФИО", "Анна Смирнова");
    await next("Ваша должность");
    await skip("Кого ищете?");
    answer("Должность", "Логист");
    await next("В каком городе?");
    await skip("Какая вилка зарплаты?");
    answer("От, ₽", "200 000");
    answer("До, ₽", "150 000");
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Нижняя граница больше верхней");
    expect(completeBriefAction).not.toHaveBeenCalled();
  });

  it("отказ сервера возвращает к вопросу, на котором споткнулись", async () => {
    completeBriefAction.mockResolvedValue({
      field: "email",
      error: "Этот адрес уже привязан к другому кабинету",
    });
    renderWizard({ needsEmail: true });

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");
    answer("ФИО", "Анна Смирнова");
    await next("Ваша должность");
    await skip("Рабочая почта");
    answer("Почта", "hrd@starfish.ru");
    await next("Кого ищете?");
    answer("Должность", "Логист");
    await next("В каком городе?");
    await skip("Какая вилка зарплаты?");
    fireEvent.click(screen.getByRole("button", { name: "Пропустить" }));

    await question("Рабочая почта");
    expect(await screen.findByRole("alert")).toHaveTextContent("уже привязан");
    expect(field("Почта")).toHaveValue("hrd@starfish.ru");
  });

  it("случайное обновление страницы не стирает сказанное", async () => {
    const { userId } = renderWizard();

    answer("Компания", "Ромашка");
    await next("Как к вам обращаться?");

    const saved = JSON.parse(sessionStorage.getItem(`fhr-brief-draft:${userId}`) ?? "{}");
    expect(saved).toMatchObject({ index: 1, values: { company: "Ромашка" } });
  });

  it("черновик из хранилища вкладки поднимается на том же вопросе", () => {
    const userId = "u-restored";
    sessionStorage.setItem(
      `fhr-brief-draft:${userId}`,
      JSON.stringify({ index: 1, values: { company: "Ромашка", name: "Анна" } }),
    );

    renderWizard({}, userId);

    expect(screen.getByRole("heading", { name: "Как к вам обращаться?" })).toBeInTheDocument();
    expect(field("ФИО")).toHaveValue("Анна");
  });

  it("чужой черновик в той же вкладке не подхватывается", () => {
    sessionStorage.setItem(
      "fhr-brief-draft:someone-else",
      JSON.stringify({ index: 3, values: { company: "Чужая" } }),
    );

    renderWizard({}, "u-fresh");

    expect(screen.getByRole("heading", { name: "Как называется компания?" })).toBeInTheDocument();
    expect(field("Компания")).toHaveValue("");
  });

  it("после отправки черновик вкладки удаляется", async () => {
    const userId = "u-cleared";
    sessionStorage.setItem(
      `fhr-brief-draft:${userId}`,
      JSON.stringify({
        index: 5,
        values: { company: "Ромашка", name: "Анна Смирнова", vacancyTitle: "Логист" },
      }),
    );
    renderWizard({}, userId);

    fireEvent.click(await screen.findByRole("button", { name: "Готово" }));

    await waitFor(() => expect(sessionStorage.getItem(`fhr-brief-draft:${userId}`)).toBeNull());
  });
});
