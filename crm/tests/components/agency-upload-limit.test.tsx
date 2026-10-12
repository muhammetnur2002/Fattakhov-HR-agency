// @vitest-environment jsdom
/**
 * Поля загрузки агентства (скан договора, счёт, акт): файл больше предела не уходит на сервер,
 * а получает отказ у самого поля. Раньше он обрывал запрос, и человек видел «Что-то пошло не так».
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  attachAgreementFileAction: vi.fn(),
  confirmAgreementAction: vi.fn(),
  terminateAgreementAction: vi.fn(),
  attachInvoiceFileAction: vi.fn(),
  createInvoiceAction: vi.fn(),
  transitionInvoiceAction: vi.fn(),
}));

vi.mock("@/app/(agency)/a/clients/actions", () => actions);
vi.mock("@/app/(agency)/a/finance/actions", () => actions);

import { AgreementFileUpload } from "@/components/clients/agreement-actions";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { FILE_TOO_BIG_MESSAGE, MAX_FILE_SIZE, MAX_REQUEST_SIZE_MB, oversizeMessage } from "@/lib/upload-limits";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const file = (bytes: number) => new File([new Uint8Array(bytes)], "scan.pdf", { type: "application/pdf" });

describe("предел размера файла", () => {
  it("файл ровно в предел проходит, на байт больше — нет", () => {
    expect(oversizeMessage(file(MAX_FILE_SIZE))).toBe("");
    expect(oversizeMessage(file(MAX_FILE_SIZE + 1))).toBe(FILE_TOO_BIG_MESSAGE);
    expect(oversizeMessage(undefined)).toBe("");
  });

  it("потолок запроса Next не меньше предела файла: иначе страница падает раньше, чем доходит проверка", () => {
    expect(MAX_REQUEST_SIZE_MB * 1024 * 1024).toBeGreaterThan(MAX_FILE_SIZE);
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/bodySizeLimit:\s*`\$\{MAX_REQUEST_SIZE_MB\}mb`/);
  });
});

describe("поля загрузки агентства", () => {
  it("скан договора: большой файл не отправляется и объясняется у поля", () => {
    const { container } = render(<AgreementFileUpload agreementId="a1" clientId="c1" fileUrl={null} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const submit = vi.fn();
    input.form!.requestSubmit = submit;

    fireEvent.change(input, { target: { files: [file(MAX_FILE_SIZE + 1)] } });
    expect(submit).not.toHaveBeenCalled();
    expect(input.validationMessage).toBe(FILE_TOO_BIG_MESSAGE);

    fireEvent.change(input, { target: { files: [file(5 * 1024 * 1024)] } });
    expect(input.validity.customError).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("счёт и акт: то же правило у обоих полей", () => {
    const { container } = render(
      <InvoiceActions invoiceId="i1" status="ISSUED" invoiceFileUrl={null} actFileUrl={null} />,
    );
    const inputs = [...container.querySelectorAll('input[type="file"]')] as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      const submit = vi.fn();
      input.form!.requestSubmit = submit;
      fireEvent.change(input, { target: { files: [file(MAX_FILE_SIZE + 1)] } });
      expect(submit).not.toHaveBeenCalled();
      expect(input.validationMessage).toBe(FILE_TOO_BIG_MESSAGE);
    }
  });
});
