import { ApplicationList } from "@/components/candidates/application-list";
import { VacancyList } from "@/components/vacancies/vacancy-list";
import { GlobalSearchField } from "@/components/shell/global-search-field";
import { Card, CardContent } from "@/components/ui/card";
import { requireClientActor } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/search";

export const metadata = { title: "Поиск" };

export default async function ClientSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireClientActor();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const { vacancies, applications } = query
    ? await globalSearch(actor, query)
    : { vacancies: [], applications: [] };

  const nothing = vacancies.length === 0 && applications.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Поиск</h1>
        <GlobalSearchField hrefBase="" defaultValue={query} className="w-full max-w-sm" />
        {query && (
          <p className="text-sm text-muted-foreground">По запросу «{query}»</p>
        )}
      </div>

      {query && nothing && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Ничего не нашлось. Попробуйте имя кандидата, компанию или
            название вакансии.
          </CardContent>
        </Card>
      )}

      {vacancies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Вакансии</h2>
          <VacancyList vacancies={vacancies} hrefBase="/vacancies" emptyText="" />
        </section>
      )}

      {applications.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Кандидаты</h2>
          <ApplicationList
            applications={applications}
            hrefBase="/applications"
            emptyText=""
          />
        </section>
      )}
    </div>
  );
}
