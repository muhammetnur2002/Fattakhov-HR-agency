// @vitest-environment jsdom
/**
 * Карточка встречи у рекрутёра: оценку спрашивают только после встречи и её можно исправить.
 * Раньше форма «Как прошло?» висела у будущей встречи, а нажатую оценку исправить было нельзя —
 * при том, что она идёт в аналитику клиента.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/interviews", () => ({
  proposeSlotsAction: vi.fn(),
  submitFeedbackAction: vi.fn().mockResolvedValue({ ok: "Спасибо, записали" }),
  transitionInterviewAction: vi.fn(),
}));

import { InterviewSection, type InterviewView } from "@/components/interviews/interview-section";

afterEach(cleanup);

const NOW = Date.parse("2026-10-09T12:00:00Z");

function interview(over: Partial<InterviewView>): InterviewView {
  return {
    id: "i1",
    type: "FIRST",
    status: "CONFIRMED",
    format: "ONLINE",
    scheduledAt: "2026-10-10T10:00:00Z",
    durationMinutes: 60,
    timezone: "Europe/Moscow",
    meetingUrl: null,
    address: null,
    feedbackRating: null,
    feedbackNote: null,
    slots: [],
    ...over,
  } as InterviewView;
}

const view = (i: InterviewView) =>
  render(<InterviewSection applicationId="a1" interviews={[i]} participants={[]} canManage now={NOW} />);

describe("оценка встречи на карточке", () => {
  it("встреча завтра: вопроса «Как прошло?» ещё нет", () => {
    view(interview({}));
    expect(screen.queryByText("Как прошло?")).toBeNull();
  });

  it("встреча вчера: вопрос есть", () => {
    view(interview({ scheduledAt: "2026-10-08T10:00:00Z" }));
    expect(screen.getByText("Как прошло?")).toBeTruthy();
  });

  it("закрытая встреча без оценки: вопрос есть независимо от времени", () => {
    view(interview({ status: "COMPLETED", scheduledAt: null }));
    expect(screen.getByText("Как прошло?")).toBeTruthy();
  });

  it("поставленную оценку можно изменить: форма открывается с заметкой, есть «Отмена»", () => {
    view(
      interview({
        status: "COMPLETED",
        scheduledAt: "2026-10-08T10:00:00Z",
        feedbackRating: 4,
        feedbackNote: "Сильный кандидат",
      }),
    );
    expect(screen.queryByText("Как прошло?")).toBeNull();
    expect(screen.getByText("Оценка: 4 из 5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Изменить оценку" }));
    expect(screen.getByText("Как прошло?")).toBeTruthy();
    expect((screen.getByPlaceholderText(/Что важно запомнить/) as HTMLTextAreaElement).value).toBe("Сильный кандидат");

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByText("Как прошло?")).toBeNull();
  });
});
