// @vitest-environment jsdom
/**
 * Сорсинг-лид на экране (lib/services/sourcing.ts): форма добавления
 * не предлагает того, что до согласия хранить нельзя, а карточка ведёт
 * по шагам — уведомить, получить согласие.
 *
 * Сервер отказывает и сам (tests/sourcing.test.ts); здесь — чтобы форма
 * не звала рекрутера заполнять то, что потом не сохранится.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  checkDuplicatesAction: vi.fn(async () => []),
  createCandidateAction: vi.fn(),
  createConsentLinkAction: vi.fn(),
  markConsentAction: vi.fn(),
  markSourcingNoticeAction: vi.fn(),
}));
vi.mock("@/app/(agency)/a/candidates/actions", () => actions);

import { QuickAddForm } from "@/components/candidates/quick-add-form";
import { SourcingPanel } from "@/components/candidates/sourcing-panel";
import { SOURCING_LEAD_TTL_DAYS } from "@/lib/sourcing";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("форма добавления кандидата", () => {
  it("только имя, контакты и ссылка на профиль — без профиля и резюме", () => {
    render(<QuickAddForm />);

    for (const label of ["Имя и фамилия *", "Телефон", "Почта", "Telegram", "Ссылка на профиль"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    for (const label of [/должность/i, /компания/i, /Ожидание/, /Резюме/]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("объясняет режим и называет срок", () => {
    render(<QuickAddForm />);
    expect(
      screen.getByText(new RegExp(`удалятся через ${SOURCING_LEAD_TTL_DAYS} дней`)),
    ).toBeInTheDocument();
  });
});

describe("блок сорсинг-лида в карточке", () => {
  it("до уведомления — кнопка «Уведомил», ручная отметка согласия спрятана", async () => {
    render(<SourcingPanel candidateId="c1" noticeDate={null} consentLinkDays={14} />);

    expect(screen.getByRole("button", { name: "Уведомил" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Получить ссылку для кандидата" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отметить вручную" })).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Согласие уже получено на бумаге или письмом" }),
    );
    expect(screen.getByRole("button", { name: "Отметить вручную" })).toBeInTheDocument();
  });

  it("после уведомления — дата вместо кнопки", () => {
    render(
      <SourcingPanel candidateId="c1" noticeDate="3 октября" consentLinkDays={14} />,
    );
    expect(screen.getByText("Уведомлён 3 октября.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Уведомил" })).not.toBeInTheDocument();
  });
});
