// @vitest-environment jsdom
/**
 * StatusBadge: тон — один из пяти, цвет берётся только из него; длинный статус усекается
 * многоточием, а полный текст остаётся в подсказке.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AgreementStatusBadge, ClientStatusBadge } from "@/components/clients/status-badges";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/lib/status-tones";

afterEach(cleanup);

const VARIANT: Record<StatusTone, string> = {
  success: "success",
  progress: "progress",
  warning: "warning",
  danger: "destructive",
  neutral: "secondary",
};

describe("StatusBadge", () => {
  it.each(Object.entries(VARIANT))("тон %s — вид бейджа %s, тон виден в data-tone", (tone, variant) => {
    render(<StatusBadge tone={tone as StatusTone}>Статус</StatusBadge>);
    const badge = screen.getByText("Статус");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-tone", tone);
    expect(badge).toHaveAttribute("data-variant", variant);
  });

  it("красный только у danger: у остальных тонов в классах нет destructive", () => {
    for (const tone of ["success", "progress", "warning", "neutral"] as const) {
      const { unmount } = render(<StatusBadge tone={tone}>x</StatusBadge>);
      expect(screen.getByText("x").className).not.toMatch(/(?<![:\w-])(text|bg)-destructive/);
      unmount();
    }
    render(<StatusBadge tone="danger">y</StatusBadge>);
    expect(screen.getByText("y").className).toMatch(/(?<![:\w-])text-destructive/);
  });

  it("truncate: многоточие внутри, подсказка с полным текстом, бейдж не шире колонки", () => {
    render(
      <StatusBadge tone="progress" truncate>
        Заявка отправлена на проверку
      </StatusBadge>,
    );
    const badge = screen.getByTitle("Заявка отправлена на проверку");
    expect(badge.className).toMatch(/max-w-full/);
    expect(badge.firstElementChild?.className).toMatch(/\btruncate\b/);
    // min-w-0 бейджу смертелен: он схлопывается в точку (AGENTS.md, «Что ещё стоит знать»)
    expect(badge.className).not.toMatch(/(?<![\w-])min-w-0/);
  });
});

describe("статусы клиента и договора — один компонент на все списки", () => {
  it("договор: действует — зелёный, ждёт подтверждения — жёлтый, нет договора — нейтральный", () => {
    const { rerender } = render(<AgreementStatusBadge status="ACTIVE" />);
    expect(screen.getByText("Договор действует")).toHaveAttribute("data-tone", "success");
    rerender(<AgreementStatusBadge status="PENDING" />);
    expect(screen.getByText("Ждёт подтверждения")).toHaveAttribute("data-tone", "warning");
    rerender(<AgreementStatusBadge status={null} />);
    expect(screen.getByText("Без договора")).toHaveAttribute("data-tone", "neutral");
    rerender(<AgreementStatusBadge status="что-то новое" />);
    expect(screen.getByText("Без договора")).toHaveAttribute("data-tone", "neutral");
  });

  it("в карточке клиента подписи короткие: «Действует», а не «Договор действует»", () => {
    render(<AgreementStatusBadge status="ACTIVE" short />);
    expect(screen.getByText("Действует")).toHaveAttribute("data-tone", "success");
  });

  it("клиент: «Активный» не красный и не залитый основным цветом", () => {
    render(<ClientStatusBadge status="ACTIVE" />);
    expect(screen.getByText("Активный")).toHaveAttribute("data-tone", "success");
  });
});
