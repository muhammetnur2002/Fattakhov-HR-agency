import { isAgency, type Actor } from "@/lib/access";
import { listApplications } from "@/lib/services/applications";
import { listClients } from "@/lib/services/clients";
import { listVacancies } from "@/lib/services/vacancies";

/**
 * Сквозной поиск по кабинету (ТЗ — раньше поле искало только внутри
 * текущего списка: вбить фамилию кандидата и не знать заранее, в какой
 * раздел идти, было нельзя).
 *
 * Своей фильтрации видимости здесь нет и не должно быть — три сервиса
 * ниже уже её делают (BR-3 для клиента, весь орг для агентства), поиск
 * просто спрашивает у каждого его первые несколько совпадений.
 */
export async function globalSearch(actor: Actor, query: string) {
  const q = query.trim();
  if (!q) return { vacancies: [], applications: [], clients: [] };

  const [vacancies, applications, clients] = await Promise.all([
    listVacancies(actor, { query: q, take: 5 }).then((r) => r.items),
    listApplications(actor, { query: q, take: 5 }).then((r) => r.items),
    // Клиентов агентство ищет как компании; у клиента своего клиента нет
    isAgency(actor)
      ? listClients(actor, { query: q }).then((items) => items.slice(0, 5))
      : Promise.resolve([]),
  ]);

  return { vacancies, applications, clients };
}
