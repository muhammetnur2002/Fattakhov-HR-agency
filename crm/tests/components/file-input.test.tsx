// @vitest-environment jsdom
/**
 * FileInput и NativeSelect: общий вид полей, при этом поведение — как у родных элементов
 * (имя, required, accept, onChange, сброс формы).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileInput } from "@/components/ui/file-input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatFileSize, MAX_FILE_SIZE, oversizeMessage } from "@/lib/upload-limits";

afterEach(cleanup);

const file = (name: string, size = 1024) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("FileInput", () => {
  it("до выбора: кнопка «Выбрать файл» и подпись «Файл не выбран» по-русски", () => {
    render(<FileInput name="file" aria-label="Скан договора" />);
    expect(screen.getByText("Выбрать файл")).toBeInTheDocument();
    expect(screen.getByText("Файл не выбран")).toBeInTheDocument();
  });

  it("настоящее поле: name, required, accept и подпись для читалки — как у родного", () => {
    render(<FileInput name="scan" required accept=".pdf" aria-label="Скан договора" />);
    const input = screen.getByLabelText("Скан договора") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input).toHaveAttribute("name", "scan");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("accept", ".pdf");
  });

  it("после выбора: имя файла и размер на виду, onChange получает событие", async () => {
    const onChange = vi.fn();
    render(<FileInput aria-label="Файл" onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText("Файл"), file("dogovor.pdf", 1.5 * 1024 * 1024));
    expect(screen.getByText("dogovor.pdf")).toBeInTheDocument();
    expect(screen.getByText(/1,5\s*МБ/)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Файл не выбран")).not.toBeInTheDocument();
  });

  it("несколько файлов: «Выбрано файлов: N», кнопка во множественном числе", async () => {
    render(<FileInput aria-label="Файлы" multiple />);
    expect(screen.getByText("Выбрать файлы")).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText("Файлы"), [file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    expect(screen.getByText("Выбрано файлов: 3")).toBeInTheDocument();
  });

  it("подпись выбранного читает и читалка: поле ссылается на неё через aria-describedby", async () => {
    render(<FileInput aria-label="Файл" aria-describedby="hint" />);
    const input = screen.getByLabelText("Файл");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toContain("hint");
    const captionId = ids.find((id) => id !== "hint") as string;
    expect(document.getElementById(captionId)).toHaveTextContent("Файл не выбран");
    await userEvent.upload(input, file("scan.pdf"));
    expect(document.getElementById(captionId)).toHaveTextContent("scan.pdf");
  });

  it("форма очищает поля после отправки — подпись очищается вместе с ней", async () => {
    render(
      <form data-testid="form">
        <FileInput aria-label="Файл" />
      </form>,
    );
    await userEvent.upload(screen.getByLabelText("Файл"), file("scan.pdf"));
    expect(screen.getByText("scan.pdf")).toBeInTheDocument();
    fireEvent.reset(screen.getByTestId("form"));
    expect(screen.getByText("Файл не выбран")).toBeInTheDocument();
  });

  it("отключённое поле: input disabled, и плашка приглушена атрибутом, который читает CSS", () => {
    const { container } = render(<FileInput aria-label="Файл" disabled />);
    expect(screen.getByLabelText("Файл")).toBeDisabled();
    expect(container.querySelector('[data-slot="file-input"]')?.className).toMatch(/has-\[:disabled\]:opacity-50/);
  });

  it("aria-invalid доходит до поля, а плашка красит рамку по нему", () => {
    const { container } = render(<FileInput aria-label="Файл" aria-invalid />);
    expect(screen.getByLabelText("Файл")).toHaveAttribute("aria-invalid", "true");
    expect(container.querySelector('[data-slot="file-input"]')?.className).toMatch(/has-\[\[aria-invalid=true\]\]:border-destructive/);
  });

  it("ref отдаётся наружу: форма может вызвать setCustomValidity", () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileInput aria-label="Файл" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    ref.current?.setCustomValidity("Файл больше 20 МБ");
    expect(ref.current?.validationMessage).toBe("Файл больше 20 МБ");
  });

  it("предел 20 МБ — из lib/upload-limits.ts: поле его не дублирует, форма проверяет через onChange", async () => {
    let message = "";
    render(
      <FileInput
        aria-label="Файл"
        onChange={(e) => {
          message = oversizeMessage(e.target.files?.[0]);
        }}
      />,
    );
    await userEvent.upload(screen.getByLabelText("Файл"), file("big.pdf", MAX_FILE_SIZE + 1));
    expect(message).not.toBe("");
    await userEvent.upload(screen.getByLabelText("Файл"), file("ok.pdf", 1000));
    expect(message).toBe("");
  });

  it("размер: байты, килобайты, мегабайты с запятой", () => {
    expect(formatFileSize(500)).toMatch(/^500\s*Б$/);
    expect(formatFileSize(340 * 1024)).toMatch(/^340\s*КБ$/);
    expect(formatFileSize(1.2 * 1024 * 1024)).toMatch(/^1,2\s*МБ$/);
    expect(formatFileSize(15 * 1024 * 1024)).toMatch(/^15\s*МБ$/);
  });
});

describe("NativeSelect", () => {
  it("родной select: name, required, defaultValue, option и выбор уходят с формой", async () => {
    render(
      <form data-testid="form">
        <NativeSelect name="reason" aria-label="Причина" required defaultValue="">
          <option value="" disabled>
            Выберите
          </option>
          <option value="A">Первая</option>
          <option value="B">Вторая</option>
        </NativeSelect>
      </form>,
    );
    const select = screen.getByLabelText("Причина") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select).toBeRequired();
    expect(select).toHaveValue("");
    await userEvent.selectOptions(select, "B");
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("reason")).toBe("B");
  });

  it("className уходит на обёртку (ширина), а не на select; размер и slot — на select", () => {
    const { container } = render(
      <NativeSelect aria-label="Список" className="w-full" size="sm">
        <option>x</option>
      </NativeSelect>,
    );
    const wrapper = container.querySelector('[data-slot="native-select-wrapper"]') as HTMLElement;
    expect(wrapper.className).toMatch(/\bw-full\b/);
    expect(wrapper.className).not.toMatch(/\bw-fit\b/);
    const select = screen.getByLabelText("Список");
    expect(select).toHaveAttribute("data-slot", "native-select");
    expect(select).toHaveAttribute("data-size", "sm");
  });

  it("onChange и controlled value работают как у родного", async () => {
    const onChange = vi.fn();
    render(
      <NativeSelect aria-label="Этап" value="1" onChange={onChange}>
        <option value="1">Один</option>
        <option value="2">Два</option>
      </NativeSelect>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Этап"), "2");
    expect(onChange).toHaveBeenCalled();
  });

  it("disabled: отключается сам select, стрелка приглушается вместе с ним (peer-disabled)", () => {
    const { container } = render(
      <NativeSelect aria-label="Список" disabled>
        <option>x</option>
      </NativeSelect>,
    );
    expect(screen.getByLabelText("Список")).toBeDisabled();
    expect(container.querySelector("svg")?.getAttribute("class")).toMatch(/peer-disabled:opacity-50/);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
