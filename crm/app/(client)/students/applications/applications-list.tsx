"use client";

import { FileText, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EmployerApplication, StudentsApplicationStatus } from "@/lib/students-service";
import { studyLine } from "@/lib/study-level";
import { cn } from "@/lib/utils";
import { applicationAction } from "../actions";

const STATUS_LABEL: Record<StudentsApplicationStatus, string> = {
  NEW: "Новый отклик",
  VIEWED: "Просмотрен",
  INVITED: "Приглашение",
  INTERVIEW: "Собеседование",
  HIRED: "Вышел на работу",
  REJECTED: "Отказ",
};

const STATUS_VARIANT: Record<StudentsApplicationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NEW: "default",
  VIEWED: "secondary",
  INVITED: "secondary",
  INTERVIEW: "secondary",
  HIRED: "default",
  REJECTED: "outline",
};

const NEXT_STEPS: { status: StudentsApplicationStatus; label: string }[] = [
  { status: "INVITED", label: "Пригласить" },
  { status: "INTERVIEW", label: "Собеседование" },
  { status: "HIRED", label: "Вышел на работу" },
  { status: "REJECTED", label: "Отказать" },
];

const WEEKDAY: Record<string, string> = { MON: "Пн", TUE: "Вт", WED: "Ср", THU: "Чт", FRI: "Пт", SAT: "Сб", SUN: "Вс" };

type Filter = "all" | StudentsApplicationStatus;

export function ApplicationsList({ applications }: { applications: EmployerApplication[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = applications.filter((a) => filter === "all" || a.status === filter);
  const newCount = applications.filter((a) => a.status === "NEW").length;

  function run(id: string, status: StudentsApplicationStatus | "VIEW") {
    setError(null);
    startTransition(async () => {
      const result = await applicationAction(id, status);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function toggle(application: EmployerApplication) {
    const opening = openId !== application.id;
    setOpenId(opening ? application.id : null);
    // Открыли карточку нового отклика — студент видит, что его заметили
    if (opening && application.status === "NEW") run(application.id, "VIEW");
  }

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Откликов пока нет. Они появятся, когда студент смахнёт вашу вакансию вправо.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="pill-scroller flex gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Все
        </Chip>
        <Chip active={filter === "NEW"} onClick={() => setFilter("NEW")}>
          Новые{newCount > 0 ? ` · ${newCount}` : ""}
        </Chip>
        <Chip active={filter === "INVITED"} onClick={() => setFilter("INVITED")}>
          Приглашены
        </Chip>
        <Chip active={filter === "HIRED"} onClick={() => setFilter("HIRED")}>
          Вышли на работу
        </Chip>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ничего не нашлось.</p>
      ) : (
        <div className="grid gap-3">
          {visible.map((a) => {
            const open = openId === a.id;
            return (
              <Card key={a.id} className={cn("relative overflow-hidden", a.status === "REJECTED" && "opacity-70")}>
                {a.status === "NEW" && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                <CardContent className="space-y-3 py-4">
                  <button
                    type="button"
                    onClick={() => toggle(a)}
                    aria-expanded={open}
                    className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ApplicantPhoto applicationId={a.id} name={a.student.fullName} hasPhoto={a.student.hasPhoto} />
                      <div className="min-w-0">
                        <div className="font-medium">{a.student.fullName}</div>
                        <div className="text-sm text-muted-foreground">
                          {a.vacancyTitle} · {a.student.university}, {studyLine(a.student.studyLevel, a.student.studyYear)}
                        </div>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t pt-3 text-sm">
                      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        <Row label="Специальность" value={a.student.speciality} />
                        <Row label="Возраст" value={`${a.student.age}`} />
                        <Row label="Город" value={a.student.city} />
                        <Row
                          label="Когда может"
                          value={
                            a.student.workDays.length
                              ? `${a.student.workDays.map((d) => WEEKDAY[d] ?? d).join(", ")}${
                                  a.student.hoursPerWeek ? ` · до ${a.student.hoursPerWeek} ч/нед` : ""
                                }`
                              : null
                          }
                        />
                        <Row label="Почта" value={a.student.email} />
                        <Row label="Телефон" value={a.student.phone} />
                      </dl>
                      {a.student.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {a.student.skills.map((s) => (
                            <Badge key={s} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {a.student.about && <p className="text-muted-foreground">{a.student.about}</p>}
                      {a.student.hasResume && (
                        <Button asChild size="sm" variant="outline" className="w-fit">
                          <a
                            href={`/api/students-applicant-file?applicationId=${encodeURIComponent(a.id)}&kind=resume`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText className="size-4" aria-hidden />
                            {a.student.resumeName ?? "Резюме"}
                          </a>
                        </Button>
                      )}
                      {!a.student.studyVerified && (
                        <p className="text-xs text-muted-foreground">Учёба ещё не подтверждена агентством.</p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Беседа появится в списке «Сообщения» после первого сообщения или с черновиком */}
                        <Button asChild size="sm">
                          <Link href={`/students/messages?thread=${encodeURIComponent(a.id)}`}>
                            <MessageSquare className="size-4" aria-hidden />
                            Написать студенту
                          </Link>
                        </Button>
                        {NEXT_STEPS.filter((s) => s.status !== a.status).map((s) => (
                          <Button
                            key={s.status}
                            size="sm"
                            variant={s.status === "REJECTED" ? "outline" : "secondary"}
                            disabled={pending}
                            onClick={() => run(a.id, s.status)}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Фото студента, откликнувшегося на вакансию: файл берётся по отклику, чужие не открываются. */
function ApplicantPhoto({ applicationId, name, hasPhoto }: { applicationId: string; name: string; hasPhoto?: boolean }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Avatar className="size-10 shrink-0">
      {hasPhoto && (
        <AvatarImage src={`/api/students-applicant-file?applicationId=${encodeURIComponent(applicationId)}&kind=photo`} alt="" />
      )}
      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
