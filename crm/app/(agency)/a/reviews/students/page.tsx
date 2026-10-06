import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceUnavailable } from "../service-unavailable";
import { ageLabel, GENDER_LABEL, StudentStatusBadges } from "./student-bits";
import { StudentFilters } from "./student-filters";
import { PresenceLabel } from "@/components/presence/presence-label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  fetchInstitutionNames,
  searchPlatformStudents,
  StudentsRateLimitedError,
  StudentsServiceError,
  type PlatformStudentItem,
  type PlatformStudentSearch,
} from "@/lib/students-service";
import {
  countActiveFilters,
  parseStudentSearchParams,
  studentSearchQuery,
  type StudentSearchParams,
} from "@/lib/students-search-params";
import { studyLine } from "@/lib/study-level";

export const metadata = { title: "Студенты платформы" };

type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_SKILL_CHIPS = 6;

/**
 * Поиск студентов студенческой платформы для подбора. Доступ — грант
 * students.search (владельцу есть всегда). Один запрос списка на загрузку
 * страницы: платформа сама отдаёт нужную страницу, а ФИО расшифровывает только
 * у отобранных. Условия — в адресе страницы, поэтому выборку можно скопировать.
 */
export default async function StudentsSearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.search")) notFound();

  const params = parseStudentSearchParams(await searchParams);

  const limit = await guardRate("studentSearch", actor.id);
  if (!limit.allowed) {
    return (
      <div className="space-y-6">
        <Header />
        <Alert variant="destructive">
          <AlertDescription>{rateLimitMessage(limit.retryAfter)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Справочник вузов — подсказки в фильтре; кэшируется на час, без него фильтр остаётся текстовым
  const [institutions, searched] = await Promise.all([
    fetchInstitutionNames(),
    searchPlatformStudents(studentSearchQuery(params), actor.id).then(
      (result) => ({ result }) as { result: PlatformStudentSearch; error?: undefined },
      (error: unknown) => {
        if (!(error instanceof StudentsServiceError)) throw error;
        return { error } as { result?: undefined; error: StudentsServiceError };
      },
    ),
  ]);

  if (searched.error) {
    return (
      <div className="space-y-6">
        <Header />
        <StudentFilters params={params} institutions={institutions} />
        <ServiceUnavailable
          message={searched.error.message}
          showSetupHint={!(searched.error instanceof StudentsRateLimitedError)}
        />
      </div>
    );
  }

  const { result } = searched;
  const filtered = countActiveFilters(params) > 0;
  // Адрес со страницей, которой уже нет (выборку сузили или ссылка устарела)
  const outOfRange = result.items.length === 0 && result.total > 0;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const backQuery = studentSearchQuery(params).toString();

  return (
    <div className="space-y-6">
      <Header />
      <StudentFilters params={params} institutions={institutions} />

      {result.hint && (
        <Alert>
          <AlertDescription>{result.hint}</AlertDescription>
        </Alert>
      )}

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center text-sm text-muted-foreground">
            <p>
              {result.hint
                ? "Результаты покажем, когда выборка станет уже."
                : outOfRange
                  ? `Страницы ${result.page} в этой выборке нет — всего найдено ${result.total}.`
                  : filtered
                    ? "Под эти условия никого не нашли — ослабьте фильтры или проверьте написание."
                    : "На платформе пока нет студентов."}
            </p>
            {outOfRange && !result.hint ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/a/reviews/students${studentSearchQuery(params, { page: 1 }).size ? `?${studentSearchQuery(params, { page: 1 })}` : ""}`}>
                  К первой странице
                </Link>
              </Button>
            ) : (
              filtered && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/a/reviews/students">Сбросить фильтры</Link>
                </Button>
              )
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Найдено: {result.total}
            {pages > 1 && ` · страница ${result.page} из ${pages}`}
          </p>
          <ul className="grid gap-3 xl:grid-cols-2">
            {result.items.map((student) => (
              <li key={student.id} className="min-w-0">
                <StudentRow student={student} backQuery={backQuery} />
              </li>
            ))}
          </ul>
          {pages > 1 && <Pagination params={params} page={result.page} pages={pages} />}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/reviews">← Студенческая платформа</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Студенты</h1>
        <p className="text-sm text-muted-foreground">
          Студенты платформы для подбора: вуз, специальность, курс, навыки, возраст и статус.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Персональные данные студентов: открываются для подбора, просмотры записываются в журнал.
        </p>
      </div>
    </>
  );
}

const DATE = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" });

function StudentRow({ student, backQuery }: { student: PlatformStudentItem; backQuery: string }) {
  const meta = [ageLabel(student.age), GENDER_LABEL[student.gender], student.city].filter(Boolean).join(" · ");
  const education = [
    student.university || "Вуз не указан",
    student.speciality,
    student.studyYear > 0 ? studyLine(student.studyLevel, student.studyYear) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const href = `/a/reviews/students/${encodeURIComponent(student.id)}${backQuery ? `?back=${encodeURIComponent(backQuery)}` : ""}`;

  return (
    <Link
      href={href}
      className="block h-full rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="line-clamp-2 font-medium break-words">{student.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StudentStatusBadges student={student} />
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm break-words">{education}</p>

      {student.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {student.skills.slice(0, MAX_SKILL_CHIPS).map((skill) => (
            <Badge key={skill} variant="outline" className="max-w-40 truncate font-normal">
              {skill}
            </Badge>
          ))}
          {student.skills.length > MAX_SKILL_CHIPS && (
            <span className="text-xs text-muted-foreground">+{student.skills.length - MAX_SKILL_CHIPS}</span>
          )}
        </div>
      )}

      {student.about && <p className="mt-2 line-clamp-2 text-sm break-words text-muted-foreground">{student.about}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Регистрация: {DATE.format(new Date(student.createdAt))}</span>
        <PresenceLabel lastSeenAt={student.lastSeenAt} />
      </div>
    </Link>
  );
}

function Pagination({ params, page, pages }: { params: StudentSearchParams; page: number; pages: number }) {
  const href = (n: number) => {
    const query = studentSearchQuery(params, { page: n }).toString();
    return `/a/reviews/students${query ? `?${query}` : ""}`;
  };
  return (
    <nav aria-label="Страницы" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)} rel="prev">
            ← Назад
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)} rel="next">
            Дальше →
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
