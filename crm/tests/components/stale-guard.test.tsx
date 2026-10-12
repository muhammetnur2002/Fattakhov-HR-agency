// @vitest-environment jsdom
/**
 * «Страница устарела» не глотается в catch вокруг серверного действия.
 *
 * Проверка 11.10.2026: новые пустые `catch { … "нет связи" }` в переносе карточки, комментариях,
 * сообщениях и автосохранении заявки проглатывали UnrecognizedActionError: вместо экрана
 * «Страница устарела» человек видел «нет связи, повторите», а повтор с устаревшей вкладки
 * больше никогда не проходил. Хук useStaleGuard пробрасывает такую ошибку в границу ошибок.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Component, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import { useStaleGuard } from "@/lib/hooks/use-stale-guard";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>граница ошибок</p> : this.props.children;
  }
}

function Sender({ error }: { error: unknown }) {
  const guardStale = useStaleGuard();
  const [message, setMessage] = useState("");
  async function send() {
    try {
      throw error;
    } catch (e) {
      if (guardStale(e)) return;
      setMessage("нет связи, повторите");
    }
  }
  return (
    <div>
      <button onClick={() => void send()}>отправить</button>
      <span>{message}</span>
    </div>
  );
}

afterEach(cleanup);

describe("useStaleGuard", () => {
  it("устаревшая вкладка: исключение уходит в границу ошибок, а не в «нет связи»", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <Sender error={new UnrecognizedActionError("Server Action not found")} />
      </Boundary>,
    );
    fireEvent.click(screen.getByText("отправить"));
    expect(await screen.findByText("граница ошибок")).toBeTruthy();
    expect(screen.queryByText("нет связи, повторите")).toBeNull();
  });

  it("обычный сбой сети: guard его не трогает, остаётся сообщение «нет связи»", async () => {
    render(
      <Boundary>
        <Sender error={new TypeError("fetch failed")} />
      </Boundary>,
    );
    fireEvent.click(screen.getByText("отправить"));
    expect(await screen.findByText("нет связи, повторите")).toBeTruthy();
    expect(screen.queryByText("граница ошибок")).toBeNull();
  });
});

describe("места с перехватом сбоя действия", () => {
  const FILES = [
    "components/kanban/kanban-board.tsx",
    "components/comments/comment-thread.tsx",
    "components/messages/message-thread.tsx",
    "components/vacancies/vacancy-wizard.tsx",
    "app/(client)/students/messages/student-messages.tsx",
  ];

  it("каждый catch (error) с сообщением о сбое сначала спрашивает guardStale", () => {
    for (const file of FILES) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).toContain("useStaleGuard");
      const catches = [...src.matchAll(/catch \(error\) \{\s*(if \(guardStale\(error\)\) return;)?/g)];
      expect(catches.length, `${file}: есть перехват`).toBeGreaterThan(0);
      for (const m of catches) expect(m[1], `${file}: catch без guardStale`).toBeTruthy();
      // пустых `catch {` с текстом про сеть не осталось
      expect(/catch \{\s*(?:\/\/[^\n]*\n\s*)*(?:setState|setError|toast\.error|setSaveFailed)/.test(src), `${file}: пустой catch`).toBe(false);
    }
  });
});
