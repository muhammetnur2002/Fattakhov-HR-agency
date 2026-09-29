import { notFound } from "next/navigation";

import { CompanyProfileForm } from "@/components/client/company-profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/services/company-profile";

export const metadata = { title: "Профиль компании" };

/**
 * Профиль компании клиента: логотип, реквизиты и «о компании».
 * Открывается из меню на кружке пользователя. Для клиентов без договора это
 * то, по чему агентство проверяет компанию перед публикацией вакансии.
 */
export default async function CompanyPage() {
  const actor = await requireClientActor();
  if (!actor.clientId) notFound();

  const company = await getCompanyProfile(actor.clientId);
  if (!company) notFound();
  const editable = canDo(actor, "org.manageClientUsers", { clientId: actor.clientId });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Профиль компании</h1>
        <p className="text-sm text-muted-foreground">
          Так компанию видят агентство и студенты. Заполните ИНН и описание — без них вакансию на студенческую
          платформу отправить нельзя.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{company.name}</CardTitle>
          <CardDescription>Логотип, реквизиты и рассказ о компании</CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyProfileForm company={company} editable={editable} />
        </CardContent>
      </Card>
    </div>
  );
}
