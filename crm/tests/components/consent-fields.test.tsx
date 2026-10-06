// @vitest-environment jsdom
/**
 * Галочки согласия под формами сайта (заявка, аудит).
 *
 * Держит то, что требует документ юриста №2: галочка не отмечена заранее
 * и обязательна, у неё — текст отметки из документа со ссылкой на
 * политику, а полный текст согласия доступен здесь же, до отправки, —
 * и раскрывашка стоит вне label, чтобы её нажатие не ставило галочку.
 */
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConsentFields } from "@/components/marketing/consent-fields";
import { VISITOR_CONSENT_DOCUMENT } from "@/lib/legal/visitor-consent";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("галочки согласия на сайте", () => {
  it("обязательная галочка пустая, с текстом отметки и ссылкой на политику", () => {
    render(<ConsentFields idPrefix="lead" />);
    const consent = screen.getByRole("checkbox", { name: /Я даю согласие на обработку моих персональных данных/ });
    expect(consent).toBeRequired();
    expect(consent).not.toBeChecked();

    const policy = screen.getByRole("link", { name: "Политикой в отношении обработки персональных данных" });
    expect(policy).toHaveAttribute("href", "/privacy");
  });

  it("полный текст согласия — здесь же, вне label", () => {
    const { container } = render(<ConsentFields idPrefix="lead" />);
    const details = container.querySelector("details")!;
    expect(details.querySelector("summary")).toHaveTextContent("Текст согласия");
    expect(details.closest("label")).toBeNull();

    // Каждый блок документа показан, ни один не потерян по дороге
    const shown = details.textContent!.replace(/\s+/g, " ");
    for (const block of VISITOR_CONSENT_DOCUMENT) {
      expect(shown).toContain(block.text.replace(/\s+/g, " "));
    }
  });

  it("реклама — отдельная и необязательная галочка", () => {
    render(<ConsentFields idPrefix="lead" />);
    const marketing = screen.getByRole("checkbox", { name: /информационные и рекламные/ });
    expect(marketing).not.toBeRequired();
    expect(marketing).not.toBeChecked();
  });
});
