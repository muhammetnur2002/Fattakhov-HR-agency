// @vitest-environment jsdom
/**
 * Alert и FormMessage: ошибка и успех различаются формой значка, а не только цветом, и
 * объявляются читалкой по-разному (alert — сразу, status — вежливо).
 *
 * Сверка 11.10.2026: оба варианта были `role="alert"` и отличались цветом текста; «Сохранено»
 * перебивало читалку, как отказ, а при высокой контрастности (заливка отбрасывается) ошибку
 * от успеха отличить было нечем.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";

afterEach(cleanup);

/** Имя значка lucide берётся из класса svg: `lucide-circle-alert`, `lucide-circle-check`. */
const glyph = (el: Element) => /lucide-[\w-]+/.exec(el.querySelector("svg")?.getAttribute("class") ?? "")?.[0];

describe("Alert", () => {
  it("ошибка: role=alert и значок «!»", () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Не получилось</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(glyph(alert)).toBe("lucide-circle-alert");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("успех: role=status (вежливо) и значок-галочка", () => {
    render(
      <Alert variant="success">
        <AlertDescription>Готово</AlertDescription>
      </Alert>,
    );
    const status = screen.getByRole("status");
    expect(glyph(status)).toBe("lucide-circle-check");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("предупреждение: треугольник и status", () => {
    render(<Alert variant="warning">Внимание</Alert>);
    expect(glyph(screen.getByRole("status"))).toBe("lucide-triangle-alert");
  });

  it("обычная плашка — без значка и role=status, а не alert", () => {
    render(<Alert>Подсказка</Alert>);
    const note = screen.getByRole("status");
    expect(note.querySelector("svg")).toBeNull();
  });

  it("явная роль и значок сохраняются, значок отключается через icon={false}", () => {
    render(
      <>
        <Alert variant="destructive" role="status" icon={false}>
          Без значка
        </Alert>
        <Alert data-testid="own" icon={<svg data-testid="own-icon" />}>
          Свой значок
        </Alert>
      </>,
    );
    expect(screen.getByText("Без значка").querySelector("svg")).toBeNull();
    expect(screen.getByText("Без значка")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("own-icon")).toBeInTheDocument();
  });

  it("форма значка у ошибки и успеха разная", () => {
    render(
      <>
        <Alert variant="destructive" data-testid="e">
          Ошибка
        </Alert>
        <Alert variant="success" data-testid="s">
          Успех
        </Alert>
      </>,
    );
    expect(glyph(screen.getByTestId("e"))).not.toBe(glyph(screen.getByTestId("s")));
  });
});

describe("FormMessage", () => {
  it("пусто — ничего не рисует (пустой ребёнок дал бы лишний отступ в space-y)", () => {
    const { container } = render(<FormMessage error={undefined} ok={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ошибка: плашка с role=alert, метка для useFormAction, можно сфокусировать программно", () => {
    render(<FormMessage error="Недостаточно прав" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Недостаточно прав");
    expect(alert).toHaveAttribute("data-form-message", "error");
    expect(alert).toHaveAttribute("tabindex", "-1");
    expect(glyph(alert)).toBe("lucide-circle-alert");
  });

  it("успех: значок-галочка, у самой плашки роли нет — читалке она уходит через постоянную область", () => {
    render(<FormMessage ok="Сохранено" />);
    const plate = screen.getByText("Сохранено").closest("[data-form-message=ok]")!;
    expect(glyph(plate)).toBe("lucide-circle-check");
    // Живая область, вставленная в страницу уже с текстом, объявляется не везде, а с двумя озвучками
    // читалка прочла бы «Сохранено» дважды: роли status и alert у плашки быть не должно
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("compact: строка без рамки, значок и роли те же", () => {
    render(
      <>
        <FormMessage compact error="Не отправилось" />
        <FormMessage compact ok="Отправлено" />
      </>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.tagName).toBe("P");
    expect(alert).not.toHaveAttribute("data-slot", "alert");
    expect(glyph(alert)).toBe("lucide-circle-alert");
    const ok = screen.getByText("Отправлено").closest("[data-form-message=ok]")!;
    expect(ok.tagName).toBe("P");
    expect(glyph(ok)).toBe("lucide-circle-check");
    expect(ok).not.toHaveAttribute("role");
  });

  it("ошибка и успех вместе: обе строки на месте, ошибка первой", () => {
    render(<FormMessage error="Не всё" ok="Часть сохранена" />);
    const [first, second] = [screen.getByRole("alert"), screen.getByText("Часть сохранена")];
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
