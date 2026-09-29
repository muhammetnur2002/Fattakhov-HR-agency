/**
 * Разделы кабинета клиента, которые работают только по договору: это работа
 * агентства (заявки на подбор, кандидаты от рекрутера, встречи, отчёты, переписка
 * с командой). Студенческая платформа, дашборд, настройки и «Документы» открыты
 * всем: в документах клиент без договора как раз берёт шаблон договора, подписывает
 * и присылает нам на проверку.
 */
export const CONTRACT_ONLY_PREFIXES = ["/vacancies", "/candidates", "/calendar", "/analytics", "/messages"] as const;

export function isContractOnlyPath(pathname: string): boolean {
  return CONTRACT_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** none — условия не выбраны, pending — выбраны, договор ждёт подтверждения, active — договор действует. */
export type ContractState = "none" | "pending" | "active";
