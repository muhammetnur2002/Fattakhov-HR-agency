// @vitest-environment jsdom
/**
 * Фото вакансии в форме CRM: первое — обложка карточки в ленте студентов, порядок задаёт клиент,
 * в форму уходят только адреса уже загруженных файлов (поля photo, в порядке показа).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(client)/students/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/students/new" }));

import { PhotosField } from "@/app/(client)/students/vacancy-form";

const A = "/api/files/company/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png";
const B = "/api/files/company/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png";
const C = "/api/files/company/cccccccc-cccc-cccc-cccc-cccccccccccc.png";

function photos(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[name="photo"]')].map((i) => i.value);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("фото вакансии", () => {
  it("первое фото помечено обложкой, порядок сохраняется в полях формы", () => {
    const { container } = render(<PhotosField initialPhotos={[A, B]} />);
    expect(screen.getByText("Обложка")).toBeInTheDocument();
    expect(photos(container)).toEqual([A, B]);
  });

  it("«Сделать обложкой» переносит фото на первое место", async () => {
    const { container } = render(<PhotosField initialPhotos={[A, B, C]} />);
    const buttons = screen.getAllByRole("button", { name: "Сделать обложкой" });
    expect(buttons).toHaveLength(2); // у самой обложки такой кнопки нет
    await userEvent.click(buttons[1]);
    expect(photos(container)).toEqual([C, A, B]);
  });

  it("«Убрать» удаляет фото из формы", async () => {
    const { container } = render(<PhotosField initialPhotos={[A, B]} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Убрать" })[0]);
    expect(photos(container)).toEqual([B]);
  });

  it("загруженная картинка добавляется в конец, обложкой остаётся прежняя", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: C }) }),
    );
    const { container } = render(<PhotosField initialPhotos={[A]} />);
    const input = screen.getByLabelText("Файлы фото");
    fireEvent.change(input, { target: { files: [new File(["x"], "n.png", { type: "image/png" })] } });
    await waitFor(() => expect(photos(container)).toEqual([A, C]));
  });

  it("файл больше 4 МБ не отправляется, показывается причина", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PhotosField initialPhotos={[]} />);
    const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Файлы фото"), { target: { files: [big] } });
    expect(await screen.findByText(/больше 4 МБ/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ошибка платформы показывается, а фото не добавляется", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Неподходящий формат" }) }),
    );
    const { container } = render(<PhotosField initialPhotos={[]} />);
    fireEvent.change(screen.getByLabelText("Файлы фото"), {
      target: { files: [new File(["x"], "n.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Неподходящий формат")).toBeInTheDocument();
    expect(photos(container)).toEqual([]);
  });

  it("на шести фото добавлять больше нельзя", () => {
    const six = Array.from({ length: 6 }, (_, i) => `/api/files/company/${String(i).repeat(8)}-0000-0000-0000-000000000000.png`);
    render(<PhotosField initialPhotos={six} />);
    expect(screen.getByRole("button", { name: /Добавить ещё/ })).toBeDisabled();
  });
});
