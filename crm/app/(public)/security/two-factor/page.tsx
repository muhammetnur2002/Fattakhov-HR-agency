import { notFound } from "next/navigation";

import { TwoFactorRequired } from "@/components/settings/two-factor-required";
import { Card, CardContent } from "@/components/ui/card";
import { isAgency } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { AGENCY_HOME } from "@/lib/nav";
import { getTwoFactorStatus } from "@/lib/services/two-factor";

export const metadata = { title: "Двухфакторная защита" };

/**
 * Принудительная настройка 2FA для сотрудников агентства.
 *
 * Сюда ведут requireActor и макет /a, пока у сотрудника агентства 2FA
 * не включена. Живёт вне /a — иначе макет кабинета гонял бы человека
 * по кругу (см. TWO_FACTOR_SETUP_PATH). Клиентам страницы нет:
 * им 2FA по желанию, в настройках.
 */
export default async function TwoFactorSetupPage() {
  const actor = await requireActor({ allowWithoutTwoFactor: true });
  if (!isAgency(actor)) notFound();

  const status = await getTwoFactorStatus(actor.id);

  // Редиректа «уже включена» здесь нет намеренно: после подтверждения кода
  // Next перерисовывает страницу, и редирект унёс бы человека в кабинет раньше,
  // чем он увидел коды восстановления — единственный момент, когда они есть.
  // Заглянувшему сюда с уже включённой 2FA компонент покажет ссылку в кабинет
  return (
    <Card>
      <CardContent className="pt-6">
        <TwoFactorRequired status={status} enabled={status.enabled} homeHref={AGENCY_HOME} />
      </CardContent>
    </Card>
  );
}
