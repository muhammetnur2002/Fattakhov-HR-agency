import { AGENCY_ROLES } from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Куда ведёт уведомление.
 *
 * Один и тот же объект живёт в двух кабинетах по разным адресам:
 * карточка кандидата — это /a/applications/<id> для агентства
 * и /applications/<id> для клиента. А получатель у события часто
 * не один и не с одной стороны: на встрече присутствуют и рекрутёр,
 * и заказчик, в обсуждении пишут обе стороны, закрытие вакансии
 * рассылается сразу всем.
 *
 * Раньше адрес писался строкой прямо на месте вызова, и почти везде
 * это оказывался клиентский путь. Для агентства такая ссылка не просто
 * вела не туда: прокси уводит агентского пользователя с клиентских
 * страниц на его собственный кабинет, и рекрутёр из письма «оцените
 * встречу» попадал на дашборд — без всякого намёка, о какой встрече
 * шла речь.
 *
 * Поэтому адрес выбирается под каждого получателя (см. deliver
 * в notify.ts), а места вызова называют объект, а не путь к нему.
 */
export type CabinetLink = {
  /** Адрес в кабинете агентства. */
  agency: string;
  /** Адрес в кабинете клиента. */
  client: string;
};

/** Ссылка уведомления: одна на всех либо своя для каждого кабинета. */
export type NotificationLink = string | CabinetLink;

export const link = {
  /** Карточка кандидата в вакансии. */
  application: (applicationId: string): CabinetLink => ({
    agency: `/a/applications/${applicationId}`,
    client: `/applications/${applicationId}`,
  }),

  /** Карточка вакансии. */
  vacancy: (vacancyId: string): CabinetLink => ({
    agency: `/a/vacancies/${vacancyId}`,
    client: `/vacancies/${vacancyId}`,
  }),

  /** Переписка с конкретным человеком. */
  messagesWith: (userId: string): CabinetLink => ({
    agency: `/a/messages/${userId}`,
    client: `/messages/${userId}`,
  }),

  /**
   * Счета. У сторон это разные страницы по смыслу, а не только по
   * адресу: клиент видит свои документы, агентство — деньги целиком.
   */
  invoices: (): CabinetLink => ({
    agency: "/a/finance",
    client: "/documents",
  }),
};

/**
 * Выбрать адрес под получателя.
 *
 * Строку отдаём как есть: так записаны ссылки, у которых получатель
 * заведомо с одной стороны (заявки с сайта — только агентству),
 * и корень «/», который прокси сам разводит по кабинетам.
 */
export function resolveLink(
  value: NotificationLink | undefined,
  role: UserRole,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;

  return (AGENCY_ROLES as readonly UserRole[]).includes(role)
    ? value.agency
    : value.client;
}
