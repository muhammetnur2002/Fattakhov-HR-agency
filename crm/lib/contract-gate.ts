/**
 * Разделы кабинета клиента, которые работают только по договору: это работа
 * агентства (заявки на подбор, кандидаты от рекрутера, встречи, отчёты, счета).
 * Студенческая платформа, сообщения, дашборд и настройки открыты всем —
 * клиент без договора может пользоваться ими и видеть, что получит.
 */
export const CONTRACT_ONLY_PREFIXES = ["/vacancies", "/candidates", "/calendar", "/analytics", "/documents"] as const;

export function isContractOnlyPath(pathname: string): boolean {
  return CONTRACT_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** none — условия не выбраны, pending — выбраны, договор ждёт подтверждения, active — договор действует. */
export type ContractState = "none" | "pending" | "active";
