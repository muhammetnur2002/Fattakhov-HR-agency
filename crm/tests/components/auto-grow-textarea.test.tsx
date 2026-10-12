// @vitest-environment jsdom
/**
 * Поле сообщения растёт одинаково во всех браузерах.
 *
 * Прежний Textarea полагался на CSS `field-sizing: content`: Chrome растил
 * поле без предела, Safari и Firefox не растили вовсе. Теперь высоту ведёт
 * код: по тексту, но не выше max-height, дальше прокрутка внутри поля.
 *
 * jsdom не считает раскладку, поэтому высота текста подставляется через
 * scrollHeight — именно его читает компонент.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";

let scrollHeight = 0;

beforeEach(() => {
  scrollHeight = 40;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

function Controlled({ max = "120px" }: { max?: string }) {
  const [text, setText] = useState("");
  return (
    <>
      <AutoGrowTextarea
        aria-label="Сообщение"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ maxHeight: max }}
      />
      <button type="button" onClick={() => setText("")}>
        очистить
      </button>
    </>
  );
}

describe("AutoGrowTextarea", () => {
  it("высота следует за текстом", async () => {
    render(<Controlled />);
    const field = screen.getByLabelText("Сообщение") as HTMLTextAreaElement;
    expect(field.style.height).toBe("40px");

    scrollHeight = 88;
    await userEvent.type(field, "строка{Enter}ещё строка");

    expect(field.style.height).toBe("88px");
    expect(field.style.overflowY).toBe("hidden");
  });

  it("выше предела не растёт, дальше прокрутка внутри поля", async () => {
    render(<Controlled max="120px" />);
    const field = screen.getByLabelText("Сообщение") as HTMLTextAreaElement;

    scrollHeight = 400;
    await userEvent.type(field, "очень много текста");

    expect(field.style.height).toBe("120px");
    expect(field.style.overflowY).toBe("auto");
  });

  it("после очистки (отправки сообщения) возвращается к одной строке", async () => {
    render(<Controlled />);
    const field = screen.getByLabelText("Сообщение") as HTMLTextAreaElement;

    scrollHeight = 100;
    await userEvent.type(field, "длинное сообщение");
    expect(field.style.height).toBe("100px");

    scrollHeight = 40;
    await userEvent.click(screen.getByRole("button", { name: "очистить" }));

    expect(field.style.height).toBe("40px");
  });

  it("скрытое поле (нулевая высота) не схлопывается в ноль", () => {
    scrollHeight = 0;
    render(<Controlled />);
    const field = screen.getByLabelText("Сообщение") as HTMLTextAreaElement;

    expect(field.style.height).not.toBe("0px");
  });

  it("CSS field-sizing выключен: Chrome не растит поле поверх кода", () => {
    render(<Controlled />);
    const field = screen.getByLabelText("Сообщение");

    expect(field.className).toContain("field-sizing-fixed");
    expect(field.className).not.toContain("field-sizing-content");
  });

  it("предел по умолчанию задан классом, свой предел классом переопределяется", () => {
    const { rerender } = render(<AutoGrowTextarea aria-label="a" />);
    expect(screen.getByLabelText("a").className).toContain("max-h-40");

    rerender(<AutoGrowTextarea aria-label="a" className="max-h-32" />);
    const classes = screen.getByLabelText("a").className.split(/\s+/);
    expect(classes).toContain("max-h-32");
    expect(classes).not.toContain("max-h-40");
  });
});

describe("поля сообщений", () => {
  const COMPOSERS = [
    "components/messages/message-thread.tsx",
    "app/(client)/students/messages/student-messages.tsx",
    "components/comments/comment-thread.tsx",
    "components/candidates/candidate-comments.tsx",
  ];

  it.each(COMPOSERS)("%s: растущее поле, а не голый Textarea", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain("<AutoGrowTextarea");
    expect(source).not.toMatch(/<Textarea[\s>]/);
  });
});
