/**
 * Меню кабинетов (lib/nav.ts).
 *
 * «Настройки» агентства — у каждой роли: там у каждого свои профиль,
 * пароль, второй фактор и уведомления, а пуш на телефон включается только
 * на этой странице. Разделы владельца страница прячет сама через canDo.
 * Пока пункт требовал org.settings, рекрутер находил уведомления лишь
 * по адресу /a/settings.
 */
import { describe, expect, it } from "vitest";

import { AGENCY_NAV } from "@/lib/nav";

describe("меню агентства", () => {
  it("«Настройки» без requires — пункт есть у каждой роли", () => {
    const settings = AGENCY_NAV.find((item) => item.href === "/a/settings");
    expect(settings).toBeDefined();
    expect(settings?.requires).toBeUndefined();
  });
});
