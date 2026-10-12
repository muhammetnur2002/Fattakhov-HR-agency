/**
 * Панель уведомлений ограничена доступной высотой.
 *
 * Переход колокольчика с DropdownMenu на Popover потерял ограничение высоты, которое было у
 * DropdownMenuContent (проверка 11.10.2026): на низком экране (телефон в горизонтали) панель
 * вылезала за край. Шапка и ссылка «Все уведомления» остаются на месте, прокручивается список.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../components/shell/notification-bell.tsx", import.meta.url), "utf8");

describe("колокольчик: высота панели", () => {
  it("PopoverContent ограничен доступной высотой и не вылезает за экран", () => {
    expect(src).toMatch(/PopoverContent[\s\S]{0,200}max-h-\(--radix-popover-content-available-height\)/);
    expect(src).toMatch(/PopoverContent[\s\S]{0,260}overflow-hidden/);
  });

  it("прокручивается только список: у него min-h-0 и flex-1", () => {
    expect(src).toMatch(/<ul className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto/);
  });
});
