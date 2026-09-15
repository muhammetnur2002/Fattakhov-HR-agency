// @vitest-environment jsdom
/**
 * CommentThread: право удалить чужую реплику (comment.deleteAny).
 *
 * Право существовало в матрице лишний день, а кнопки под него не было —
 * владелец агентства технически мог убрать чужой комментарий, но
 * интерфейс такой возможности не показывал. Правка не открыла правку
 * чужого текста (исправленный чужой текст остался бы подписан чужим
 * именем — это по-прежнему только автору), только удаление, и только
 * тем, кому разрешено.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/comments", () => ({
  createCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
  markReadAction: vi.fn(),
}));

import { CommentThread, type ThreadComment } from "@/components/comments/comment-thread";

const ME = "usr_me";
const OTHER = "usr_other";

function comment(overrides: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "c1",
    body: "Текст комментария",
    visibility: "SHARED",
    parentId: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    editedAt: null,
    isRead: true,
    authorId: OTHER,
    author: { id: OTHER, fullName: "Роман Тимофеев", role: "CLIENT_HIRING", position: null },
    ...overrides,
  };
}

const baseProps = {
  applicationId: "app_1",
  canWriteInternal: false,
  canWrite: true,
  currentUserId: ME,
  emptyText: "Пока пусто",
};

describe("своя реплика", () => {
  it("показывает и «Изменить», и «Удалить»", () => {
    render(
      <CommentThread
        {...baseProps}
        comments={[comment({ authorId: ME, author: { id: ME, fullName: "Я", role: "RECRUITER", position: null } })]}
        canDeleteAny={false}
      />,
    );
    expect(screen.getByText("Изменить")).toBeInTheDocument();
    expect(screen.getByText("Удалить")).toBeInTheDocument();
  });
});

describe("чужая реплика, без права comment.deleteAny", () => {
  it("нет ни «Изменить», ни «Удалить»", () => {
    render(
      <CommentThread {...baseProps} comments={[comment()]} canDeleteAny={false} />,
    );
    expect(screen.queryByText("Изменить")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });
});

describe("чужая реплика, с правом comment.deleteAny", () => {
  it("есть «Удалить», но нет «Изменить»", () => {
    // Правка чужого текста не открывается ни при каком праве:
    // исправленный текст остался бы подписан чужим именем
    render(
      <CommentThread {...baseProps} comments={[comment()]} canDeleteAny={true} />,
    );
    expect(screen.getByText("Удалить")).toBeInTheDocument();
    expect(screen.queryByText("Изменить")).not.toBeInTheDocument();
  });

  it("подтверждение называет автора по имени — не общей фразой", () => {
    render(
      <CommentThread {...baseProps} comments={[comment()]} canDeleteAny={true} />,
    );
    fireEvent.click(screen.getByText("Удалить"));
    expect(
      screen.getByText("Удалить комментарий — Роман Тимофеев?"),
    ).toBeInTheDocument();
  });

  it("подтверждение своей реплики — без имени", () => {
    render(
      <CommentThread
        {...baseProps}
        comments={[comment({ authorId: ME, author: { id: ME, fullName: "Я", role: "RECRUITER", position: null } })]}
        canDeleteAny={true}
      />,
    );
    fireEvent.click(screen.getByText("Удалить"));
    expect(screen.getByText("Удалить комментарий?")).toBeInTheDocument();
  });
});

describe("пустой тред", () => {
  it("показывает переданный emptyText", () => {
    render(
      <CommentThread {...baseProps} comments={[]} canDeleteAny={false} />,
    );
    expect(screen.getByText("Пока пусто")).toBeInTheDocument();
  });
});
