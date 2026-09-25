import { redirect } from "next/navigation";

/**
 * Старый адрес раздела — теперь проверки и метрики пилота решаются прямо
 * в CRM, без перехода на студенческую платформу (см. /a/reviews). Ссылка
 * оставлена редиректом, а не удалена, чтобы старые закладки не ломались.
 */
export default function StudentsPlatformRedirect() {
  redirect("/a/reviews");
}
