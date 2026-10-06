import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RevealContacts } from "./reveal-contacts";
import { ServiceUnavailable } from "../../service-unavailable";
import { ageLabel, GENDER_LABEL, StudentStatusBadges } from "../student-bits";
import { PresenceLabel } from "@/components/presence/presence-label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/rate-limit";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { PROFILE_VIEW_DEDUPE_MS, recordStudentProfileAccess } from "@/lib/services/student-profile-audit";
import {
  fetchPlatformStudent,
  StudentsRateLimitedError,
  StudentsServiceError,
  type PlatformStudentProfile,
} from "@/lib/students-service";
import { parseStudentSearchParams, studentSearchQuery } from "@/lib/students-search-params";
import { studentsPermissions } from "@/lib/students-sso";
import { studyLine } from "@/lib/study-level";

export const metadata = { title: "Анкета студента" };

const WEEKDAYS: Record<string, string> = {
  MON: "Пн",
  TUE: "Вт",
  WED: "Ср",
  THU: "Чт",
  FRI: "Пт",
  SAT: "Сб",
  SUN: "Вс",
};
const WEEKDAY_ORDER = Object.keys(WEEKDAYS);

const LOOKING_FOR: Record<string, string> = {
  JOB: "Работа",
  INTERNSHIP: "Стажировка",
  PROJECT: "Проект",
};

const ACTIVITY_KIND: Record<string, string> = {
  SPORT: "Спорт и долгие занятия",
  EDUCATION: "Доп. обучение",
  COMMUNITY: "Активность в учёбе",
};

/** Ссылка из анкеты — человеческий ввод: открываем только http(s), без javascript: и подобного. */
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Анкета студента для подбора: все открытые поля, без контактов. Контакты — по
 * кнопке (серверное действие, запись в журнал доступа к ПДн). Открытие анкеты
 * тоже пишется в журнал CRM (не чаще раза в 10 минут на сотрудника и студента) и,
 * независимо, в журнал платформы.
 */
export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  const grants = effectiveGrants(actor);
  if (!grants.includes("students.search")) notFound();

  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) notFound();

  // Назад — к той же выборке; адрес собирается заново из проверенных параметров
  const rawBack = (await searchParams).back;
  const backParams = parseStudentSearchParams(
    Object.fromEntries(new URLSearchParams(typeof rawBack === "string" ? rawBack.slice(0, 1000) : "")),
  );
  const backQuery = studentSearchQuery(backParams).toString();
  const backHref = `/a/reviews/students${backQuery ? `?${backQuery}` : ""}`;

  const limit = await guardRate("studentSearch", actor.id);
  if (!limit.allowed) {
    return (
      <div className="space-y-6">
        <BackLink href={backHref} />
        <Alert variant="destructive">
          <AlertDescription>{rateLimitMessage(limit.retryAfter)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  let student: PlatformStudentProfile | null;
  try {
    student = await fetchPlatformStudent(id, { actorId: actor.id });
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return (
      <div className="space-y-6">
        <BackLink href={backHref} />
        <ServiceUnavailable
          message={error.message}
          showSetupHint={!(error instanceof StudentsRateLimitedError)}
        />
      </div>
    );
  }
  if (!student) notFound();

  // Журнал доступа к ПДн (BR-36): кто открывал анкету. ФИО в журнал не пишется
  await recordStudentProfileAccess(actor, id, "student_profile_view", clientIp(await headers()), {
    dedupeMs: PROFILE_VIEW_DEDUPE_MS,
  });

  const canOpenPlatform = studentsPermissions(grants).length > 0;
  const days = [...student.workDays].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  const education = [
    student.university || "Вуз не указан",
    student.speciality,
    student.studyYear > 0 ? studyLine(student.studyLevel, student.studyYear) : "",
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <BackLink href={backHref} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-semibold break-words">{student.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {[ageLabel(student.age), GENDER_LABEL[student.gender], student.city].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StudentStatusBadges student={student} />
          </div>
        </div>
        {canOpenPlatform && (
          <form action="/a/students/open" method="post">
            <Button type="submit" variant="outline" size="sm">
              Открыть на студенческой платформе
            </Button>
          </form>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Персональные данные студентов: открываются для подбора, просмотры записываются в журнал.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Учёба</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="break-words">{education.join(" · ")}</p>
              <p className="text-muted-foreground">
                Регистрация: {new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" }).format(new Date(student.createdAt))}
                {" · "}
                <PresenceLabel lastSeenAt={student.lastSeenAt} />
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Навыки и о себе</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {student.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {student.skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="max-w-56 truncate font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Навыки не указаны.</p>
              )}
              {student.about ? (
                <p className="break-words whitespace-pre-line">{student.about}</p>
              ) : (
                <p className="text-muted-foreground">О себе не написано.</p>
              )}
              {student.goals && (
                <div>
                  <p className="text-xs text-muted-foreground">Цели</p>
                  <p className="break-words whitespace-pre-line">{student.goals}</p>
                </div>
              )}
              {student.hobbies && (
                <div>
                  <p className="text-xs text-muted-foreground">Увлечения</p>
                  <p className="break-words whitespace-pre-line">{student.hobbies}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(student.projects.length > 0 || student.achievements.length > 0 || student.activities.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Портфолио</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {student.projects.length > 0 && (
                  <Section title="Проекты">
                    {student.projects.map((p, i) => (
                      <Item key={i} title={p.title} text={p.description} href={p.link ? safeHref(p.link) : null} />
                    ))}
                  </Section>
                )}
                {student.achievements.length > 0 && (
                  <Section title="Достижения">
                    {student.achievements.map((a, i) => (
                      <Item key={i} title={a.year ? `${a.title}, ${a.year}` : a.title} text={a.description} />
                    ))}
                  </Section>
                )}
                {student.activities.length > 0 && (
                  <Section title="Занятия вне учёбы">
                    {student.activities.map((a, i) => (
                      <Item key={i} title={a.title} text={a.description} hint={ACTIVITY_KIND[a.kind] ?? null} />
                    ))}
                  </Section>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Контакты</CardTitle>
            </CardHeader>
            <CardContent>
              <RevealContacts studentId={student.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Что ищет и когда готов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Ищет: </span>
                {student.lookingFor.length > 0
                  ? student.lookingFor.map((v) => LOOKING_FOR[v] ?? v).join(", ")
                  : "не указано"}
              </p>
              <p>
                <span className="text-muted-foreground">Дни: </span>
                {days.length > 0 ? days.map((d) => WEEKDAYS[d] ?? d).join(", ") : "не указаны"}
              </p>
              <p>
                <span className="text-muted-foreground">Часов в неделю: </span>
                {student.hoursPerWeek ?? "не указано"}
              </p>
              {(student.hasResume || student.hasPhoto) && (
                <p className="text-xs text-muted-foreground">
                  {[student.hasResume ? `резюме${student.resumeName ? ` («${student.resumeName}»)` : ""}` : null, student.hasPhoto ? "фото" : null]
                    .filter(Boolean)
                    .join(" и ")}{" "}
                  загружены на платформе — файлы здесь не открываются.
                </p>
              )}
              {student.links.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {student.links.map((link, i) => {
                    const href = safeHref(link.url);
                    return (
                      <li key={i} className="min-w-0 truncate">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-4 hover:underline">
                            {link.label || href}
                          </a>
                        ) : (
                          link.label
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost" size="sm">
        <Link href={href}>← К списку студентов</Link>
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Item({ title, text, hint, href }: { title: string; text?: string | null; hint?: string | null; href?: string | null }) {
  return (
    <li className="min-w-0">
      <p className="font-medium break-words">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-4 hover:underline">
            {title}
          </a>
        ) : (
          title
        )}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {text && <p className="break-words whitespace-pre-line text-muted-foreground">{text}</p>}
    </li>
  );
}
