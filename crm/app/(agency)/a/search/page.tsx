import { ApplicationList } from "@/components/candidates/application-list";
import { ClientList } from "@/components/clients/client-list";
import { VacancyList } from "@/components/vacancies/vacancy-list";
import { GlobalSearchField } from "@/components/shell/global-search-field";
import { Card, CardContent } from "@/components/ui/card";
import { requireAgencyActor } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/search";

export const metadata = { title: "Поиск" };

export default async function AgencySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const { vacancies, applications, clients } = query
    ? await globalSearch(actor, query)
    : { vacancies: [], applications: [], clients: [] };

  const nothing =
    vacancies.length === 0 && applications.length === 0 && clients.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Поиск</h1>
        <GlobalSearchField
          hrefBase="/a"
          defaultValue={query}
          className="w-full max-w-sm"
        />
        {query && (
          <p className="text-sm text-muted-foreground">По запросу «{query}»</p>
        )}
      </div>

      {query && nothing && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Ничего не нашлось. Попробуйте имя кандидата, название вакансии
            или компанию клиента.
          </CardContent>
        </Card>
      )}

      {clients.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Клиенты</h2>
          <ClientList clients={clients} emptyText="" />
        </section>
      )}

      {vacancies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Вакансии</h2>
          <VacancyList
            vacancies={vacancies}
            hrefBase="/a/vacancies"
            showClient
            emptyText=""
          />
        </section>
      )}

      {applications.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Кандидаты</h2>
          <ApplicationList
            applications={applications}
            hrefBase="/a/applications"
            showClient
            emptyText=""
          />
        </section>
      )}
    </div>
  );
}
