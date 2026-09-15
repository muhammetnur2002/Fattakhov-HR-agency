/**
 * Адреса в уведомлениях.
 *
 * Ошибка была не в одной строке, а в подходе: путь писали на месте
 * вызова, и почти всегда это оказывался клиентский. Получатели же
 * у большинства событий с обеих сторон — на встрече присутствуют
 * рекрутёр и заказчик, в обсуждении пишут оба. Для агентства такая
 * ссылка вела не просто мимо: прокси уводит агентского пользователя
 * с клиентских страниц на его кабинет, и письмо «оцените встречу»
 * приводило на дашборд.
 *
 * Тесты держат две вещи: что у каждого адреса есть обе стороны
 * и что выбор делается по роли, а не по чему-то ещё.
 */
import { describe, expect, it } from "vitest";

import { AGENCY_ROLES, CLIENT_ROLES } from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { link, resolveLink, type CabinetLink } from "@/lib/notifications/links";

const ALL_LINKS: Record<string, CabinetLink> = {
  application: link.application("app_1"),
  vacancy: link.vacancy("vac_1"),
  messagesWith: link.messagesWith("usr_1"),
  invoices: link.invoices(),
};

describe("адреса кабинетов", () => {
  it("агентский путь всегда начинается с /a, клиентский — никогда", () => {
    for (const [name, value] of Object.entries(ALL_LINKS)) {
      expect(value.agency, name).toMatch(/^\/a\//);
      expect(value.client, name).not.toMatch(/^\/a\//);
      expect(value.client, name).toMatch(/^\//);
    }
  });

  it("стороны не совпадают: иначе объект здесь не нужен", () => {
    for (const [name, value] of Object.entries(ALL_LINKS)) {
      expect(value.agency, name).not.toBe(value.client);
    }
  });
});

describe("выбор адреса под получателя", () => {
  it("каждая роль агентства получает агентский путь", () => {
    for (const role of AGENCY_ROLES as readonly UserRole[]) {
      expect(resolveLink(link.application("app_1"), role), role).toBe(
        "/a/applications/app_1",
      );
    }
  });

  it("каждая роль клиента получает клиентский путь", () => {
    for (const role of CLIENT_ROLES as readonly UserRole[]) {
      expect(resolveLink(link.application("app_1"), role), role).toBe(
        "/applications/app_1",
      );
    }
  });

  it("строку не трогаем: так записаны односторонние адреса", () => {
    // Заявки с сайта видит только агентство, корень прокси разводит сам
    expect(resolveLink("/a/leads", "CLIENT_ADMIN")).toBe("/a/leads");
    expect(resolveLink("/", "RECRUITER")).toBe("/");
  });

  it("без ссылки возвращается ничего, а не пустая строка", () => {
    // В записи уведомления linkUrl необязателен, и «/» вместо пустоты
    // превратил бы уведомление без адреса в ссылку на главную
    expect(resolveLink(undefined, "OWNER")).toBeUndefined();
  });

  it("счёт ведёт агентство в финансы, а клиента — в документы", () => {
    // Единственная пара, где страницы разные не только адресом:
    // клиент видит свои документы, агентство — деньги целиком
    expect(resolveLink(link.invoices(), "ACCOUNT")).toBe("/a/finance");
    expect(resolveLink(link.invoices(), "CLIENT_ADMIN")).toBe("/documents");
  });
});
