// @vitest-environment jsdom
/**
 * Кнопки «Копировать» не молчат, даже без Clipboard API.
 *
 * Раньше пять из шести кнопок вызывали navigator.clipboard.writeText прямо
 * и без защиты: на http, во встроенном браузере мессенджера или в старом
 * Safari свойства нет, вызов бросает исключение, и нажатие не делает
 * ничего — ни «Скопировано», ни понятного отказа. Теперь порядок такой:
 * буфер → скрытое поле и execCommand → «Скопируйте вручную» и выделенный
 * на экране текст.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteLink } from "@/components/clients/invite-link";
import { CopyableLink } from "@/components/shared/copyable-link";
import { CopyButton } from "@/components/shared/copy-button";
import { copyToClipboard } from "@/lib/clipboard";

const URL_TEXT = "https://my.example.test/api/calendar/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ics";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true, writable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
});

function withoutClipboardApi() {
  // Как на http и во встроенных браузерах: свойства navigator.clipboard нет вовсе
  vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
}

describe("copyToClipboard", () => {
  it("есть Clipboard API — пишет через него и не трогает запасной путь", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    expect(await copyToClipboard("текст")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("текст");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("Clipboard API отказал — запасной путь через выделение", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    expect(await copyToClipboard("текст")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("Clipboard API нет вовсе — запасной путь, исключения нет", async () => {
    withoutClipboardApi();
    await expect(copyToClipboard("текст")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("не вышло и там — false, а не исключение; временного поля не остаётся", async () => {
    withoutClipboardApi();
    execCommand.mockReturnValue(false);

    await expect(copyToClipboard("текст")).resolves.toBe(false);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("execCommand бросает — тоже false", async () => {
    withoutClipboardApi();
    execCommand.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(copyToClipboard("текст")).resolves.toBe(false);
  });
});

describe("CopyButton без Clipboard API", () => {
  it("запасной путь сработал — «Скопировано»", async () => {
    withoutClipboardApi();
    render(<CopyButton text={URL_TEXT} />);

    await userEvent.click(screen.getByRole("button", { name: /Копировать/ }));

    expect(await screen.findByRole("button", { name: /Скопировано/ })).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("не сработал ничего — «Скопируйте вручную» и выделен текст на экране", async () => {
    withoutClipboardApi();
    execCommand.mockReturnValue(false);
    render(<CopyableLink url={URL_TEXT} />);

    await userEvent.click(screen.getByRole("button", { name: /Копировать/ }));

    expect(await screen.findByRole("button", { name: /Скопируйте вручную/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Скопируйте вручную");
    await waitFor(() => expect(window.getSelection()?.toString()).toBe(URL_TEXT));
  });

  it("только значок: подпись в aria-label, отказ виден словами рядом", async () => {
    withoutClipboardApi();
    execCommand.mockReturnValue(false);
    render(<CopyButton text="x" iconOnly ariaLabel="Скопировать ссылку для кандидата" />);

    await userEvent.click(screen.getByRole("button", { name: "Скопировать ссылку для кандидата" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Скопируйте вручную");
  });

  it("нажатие не падает, если Clipboard API отказал на жесте (Safari)", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) },
    });
    render(<CopyButton text="x" />);

    await userEvent.click(screen.getByRole("button", { name: /Копировать/ }));

    expect(await screen.findByRole("button", { name: /Скопировано/ })).toBeInTheDocument();
  });
});

describe("InviteLink: скрытая ссылка при отказе буфера", () => {
  it("раскрывается и выделяется — иначе копировать вручную нечего", async () => {
    withoutClipboardApi();
    execCommand.mockReturnValue(false);
    render(<InviteLink url={URL_TEXT} />);

    expect(screen.queryByText(URL_TEXT)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Копировать/ }));

    expect(await screen.findByText(URL_TEXT)).toBeInTheDocument();
    await waitFor(() => expect(window.getSelection()?.toString()).toBe(URL_TEXT));
  });

  it("буфер работает — ссылка остаётся скрытой", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<InviteLink url={URL_TEXT} />);

    await userEvent.click(screen.getByRole("button", { name: /Копировать/ }));

    expect(await screen.findByRole("button", { name: /Скопировано/ })).toBeInTheDocument();
    expect(screen.queryByText(URL_TEXT)).toBeNull();
  });
});
