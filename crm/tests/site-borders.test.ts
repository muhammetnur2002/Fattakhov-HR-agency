/**
 * У каждой карточки тарифа, плитки роли и кейса есть контур — и у светлых, и у тёмных.
 *
 * Замечание 10.10.2026: у выделенного тарифа (`border-transparent`) и у тёмных плиток
 * «Кого закрываем» контура не было вовсе, в тёмной теме они сливались с фоном, а у соседей
 * контур был. Тест не даёт вернуть карточку без рамки.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("контур карточек сайта", () => {
  it("выделенный тариф не прозрачный: border-transparent нет, контур светлый", () => {
    const src = read("components/marketing/pricing.tsx");
    expect(src).not.toMatch(/border-transparent/);
    expect(src).toMatch(/t\.recommended\s*\?\s*"border-white\/25/);
  });

  it("плитки ролей: рамка в основе, у тёмных тонов светлый контур", () => {
    const src = read("components/marketing/role-mosaic.tsx");
    expect(src).toMatch(/rounded-2xl border p-5/);
    expect(src).toMatch(/graphite" && "border-white\/25/);
    expect(src).toMatch(/slate" && "border-white\/25/);
  });

  it("тёмный кейс с контуром, как светлые", () => {
    expect(read("components/marketing/sections.tsx")).toMatch(/"border border-white\/25 bg-brand-graphite text-white"/);
  });
});
