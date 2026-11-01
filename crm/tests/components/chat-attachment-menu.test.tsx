// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AttachmentMenu } from "@/components/messages/attachment-menu";
afterEach(cleanup);
it("opens the attachment menu without allowing unscanned uploads", () => {
  render(<AttachmentMenu />);
  fireEvent.click(screen.getByRole("button", { name: "Добавить вложение" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  for (const name of ["Файл", "Изображение", "Камера"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  expect(document.querySelector('input[type="file"]')).toBeNull();
  expect(screen.getByText(/Отправка вложений пока недоступна/)).toBeVisible();
});

