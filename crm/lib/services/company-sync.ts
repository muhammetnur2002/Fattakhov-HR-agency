import { getCompanyProfile } from "@/lib/services/company-profile";
import { syncCompanyProfile } from "@/lib/students-service";

/**
 * Отправить профиль компании из CRM на студенческую платформу.
 * Возвращает описание ошибки или null. logoUrl — адрес уже загруженного на платформу
 * логотипа (null — убрать, undefined — не трогать).
 */
export async function pushCompanyProfile(
  clientId: string,
  actorLabel: string,
  logoUrl?: string | null,
): Promise<{ error: string; code?: string } | null> {
  const company = await getCompanyProfile(clientId);
  if (!company) return { error: "Компания не найдена" };
  const result = await syncCompanyProfile({
    crmClientId: clientId,
    actor: actorLabel,
    companyName: company.name,
    inn: company.inn,
    about: company.description,
    website: company.website,
    city: company.city,
    ...(logoUrl !== undefined ? { logoUrl } : {}),
  });
  return result.error ? { error: result.error, code: result.code } : null;
}
