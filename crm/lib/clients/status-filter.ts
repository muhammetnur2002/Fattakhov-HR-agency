import type { ClientStatus } from "@/lib/generated/prisma/enums";

/**
 * Фильтр списка клиентов: «Лиды» и «Активные».
 *
 * Лид — клиента завели, договор не подписан (статус LEAD); активный —
 * работаем по договору (ACTIVE). Паузы и архив видны только без фильтра:
 * они ни лиды, ни активные, и пропадать из списка совсем не должны.
 */
export type ClientStatusFilter = "LEAD" | "ACTIVE";

/** Значение ?status= из адреса. Любое незнакомое — «все». */
export function parseClientStatusFilter(value: string | undefined): ClientStatusFilter | null {
  return value === "lead" ? "LEAD" : value === "active" ? "ACTIVE" : null;
}

export function filterClientsByStatus<T extends { status: ClientStatus }>(
  clients: T[],
  filter: ClientStatusFilter | null,
): T[] {
  return filter ? clients.filter((c) => c.status === filter) : clients;
}

export function countClientsByStatus(clients: { status: ClientStatus }[]): {
  all: number;
  leads: number;
  active: number;
} {
  return {
    all: clients.length,
    leads: clients.filter((c) => c.status === "LEAD").length,
    active: clients.filter((c) => c.status === "ACTIVE").length,
  };
}
