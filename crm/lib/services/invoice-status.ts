/**
 * Стейт-машина счёта.
 *
 * Чистый модуль без БД: правила переходов проверяются отдельно.
 * Счёт — документ про деньги, поэтому список переходов закрытый:
 * всё, чего здесь нет, запрещено.
 */
import type { InvoiceStatus } from "@/lib/generated/prisma/enums";

export const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  // Черновик можно править и выставлять
  DRAFT: ["ISSUED", "CANCELLED"],

  // Выставленный либо оплачивают, либо он просрочивается, либо аннулируют
  ISSUED: ["PAID", "OVERDUE", "CANCELLED"],

  // Просроченный всё ещё можно оплатить
  OVERDUE: ["PAID", "CANCELLED"],

  // Конечные: оплаченный счёт не «разоплачивают», ошибку исправляют
  // корректирующим документом, а не сменой статуса
  PAID: [],
  CANCELLED: [],
};

export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Счёт ждёт денег — попадает в дебиторку. */
export function isReceivable(status: InvoiceStatus): boolean {
  return status === "ISSUED" || status === "OVERDUE";
}

/** Документ закрыт: менять нечего. */
export function isFinal(status: InvoiceStatus): boolean {
  return status === "PAID" || status === "CANCELLED";
}

/**
 * Просрочен ли выставленный счёт.
 *
 * Правило существует в двух видах — предикатом для одного счёта и
 * фрагментом `where` для выборки, — но лежат они рядом, в одном
 * модуле. Так же сделано в слое доступа (lib/access: ownHiring рядом
 * с visibleVacanciesFilter) и по той же причине: то же правило,
 * записанное отдельно здесь и отдельно внутри фоновой задачи, однажды
 * разъедется, и заметить это будет нечем.
 */
export function isOverdue(
  status: InvoiceStatus,
  dueAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (status !== "ISSUED") return false;
  if (!dueAt) return false;
  return dueAt < now;
}

/** То же правило фрагментом запроса — чтобы выбрать просроченные разом. */
export function overdueInvoiceFilter(now: Date = new Date()) {
  return { status: "ISSUED" as const, dueAt: { lt: now } };
}

export class InvoiceError extends Error {}
