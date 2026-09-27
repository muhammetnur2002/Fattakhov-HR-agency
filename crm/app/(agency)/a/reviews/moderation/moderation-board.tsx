"use client";

import { Building2, Check, Flame, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { decideModerationAction } from "./actions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { studentsFileProxyUrl } from "@/lib/students-file-url";
import type {
  ModerationCompany,
  ModerationVacancy,
} from "@/lib/students-service";

type Decide = (decision: "APPROVE" | "REJECT", note?: string) => Promise<boolean>;

const COMPANY_STATUS_LABEL: Record<string, string> = {
  PENDING: "на проверке",
  APPROVED: "одобрена",
  REJECTED: "отклонена",
};

const WORK_FORMAT_LABEL: Record<string, string> = {
  ONSITE: "В офисе",
  HYBRID: "Гибрид",
  REMOTE: "Удалённо",
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  PART_TIME: "Подработка",
  SHIFT: "Сменный график",
  PROJECT: "Проект",
  INTERNSHIP: "Стажировка",
  FULL_TIME: "Полный день",
};

function money(from: number | null, to: number | null): string {
  if (!from && !to) return "Зарплата не указана";
  if (from && to && from !== to) return `${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} ₽`;
  return `${(from ?? to)!.toLocaleString("ru-RU")} ₽`;
}

export function ModerationBoard({
  companies: initialCompanies,
  vacancies: initialVacancies,
}: {
  companies: ModerationCompany[];
  vacancies: ModerationVacancy[];
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);
  const [vacancies, setVacancies] = useState(initialVacancies);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<ModerationVacancy | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visibleCompanies = q
    ? companies.filter((c) => c.companyName.toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q))
    : companies;
  const visibleVacancies = q
    ? vacancies.filter(
        (v) => v.vacancy.title.toLowerCase().includes(q) || v.vacancy.company.toLowerCase().includes(q),
      )
    : vacancies;

  async function decide(
    entity: "company" | "vacancy",
    id: string,
    decision: "APPROVE" | "REJECT",
    note?: string,
    version?: string,
  ): Promise<boolean> {
    setBusy((current) => new Set(current).add(id));
    try {
      const result = await decideModerationAction({ entity, id, decision, note, version });
      if (result.error) {
        toast.error(result.error);
        return false;
      }
      if (entity === "company") {
        const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
        setCompanies((list) => list.filter((c) => c.id !== id));
        setVacancies((list) =>
          list.map((v) => (v.companyId === id ? { ...v, companyStatus: status } : v)),
        );
      } else {
        setVacancies((list) => list.filter((v) => v.vacancy.id !== id));
      }
      toast.success(decision === "APPROVE" ? "Одобрено" : "Отклонено — причина ушла в кабинет компании");
      router.refresh();
      return true;
    } catch {
      toast.error("Не удалось сохранить решение — проверьте соединение");
      return false;
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  if (companies.length === 0 && vacancies.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Очередь пуста — новые компании и вакансии из кабинетов появятся здесь.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название компании или вакансии…"
          className="pl-8"
        />
      </div>

      {q && visibleCompanies.length === 0 && visibleVacancies.length === 0 && (
        <p className="text-sm text-muted-foreground">Ничего не нашлось по этому запросу.</p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Компании <span className="tabular-nums">{visibleCompanies.length}</span>
        </h2>
        {visibleCompanies.length === 0 ? (
          !q && <p className="text-sm text-muted-foreground">Новых компаний нет.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                busy={busy.has(company.id)}
                onDecide={(decision, note) => decide("company", company.id, decision, note)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Вакансии <span className="tabular-nums">{visibleVacancies.length}</span>
        </h2>
        {visibleVacancies.length === 0 ? (
          !q && <p className="text-sm text-muted-foreground">Новых вакансий нет.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleVacancies.map((item) => (
              <VacancyCard
                key={item.vacancy.id}
                item={item}
                busy={busy.has(item.vacancy.id)}
                onPreview={() => setPreview(item)}
                onDecide={(decision, note) =>
                  decide("vacancy", item.vacancy.id, decision, note, item.version)
                }
              />
            ))}
          </div>
        )}
      </section>

      {/*
        Форма — не копия студенческой шторки (у CRM своя библиотека
        компонентов), но тот же вид: скруглённая карточка, полоса-подложка
        за логотипом, зарплата акцентом, теги. Раньше здесь был обычный
        плоский диалог — сотрудник не понимал, на что именно похожа
        карточка, которую увидит студент.
      */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-lg">
          {preview && (
            <>
              <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-6 pb-5 pt-6">
                <DialogHeader className="contents">
                  <DialogTitle className="sr-only">{preview.vacancy.title}</DialogTitle>
                </DialogHeader>
                <div className="flex items-start gap-3">
                  <Avatar size="lg">
                    {preview.vacancy.companyLogoUrl && (
                      <AvatarImage src={studentsFileProxyUrl(preview.vacancy.companyLogoUrl)} alt="" />
                    )}
                    <AvatarFallback>
                      <Building2 className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="truncate text-sm font-medium">{preview.vacancy.company}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {preview.vacancy.city}
                      {preview.vacancy.district ? `, ${preview.vacancy.district}` : ""}
                    </p>
                  </div>
                </div>

                <h2 className="mt-4 text-xl font-semibold">{preview.vacancy.title}</h2>
                <p className="mt-1.5 text-base font-medium text-primary">
                  {money(preview.vacancy.salaryFrom, preview.vacancy.salaryTo)}
                  {preview.vacancy.salaryPeriod === "SHIFT" && " за смену"}
                  {preview.vacancy.salaryPeriod === "HOUR" && " в час"}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{WORK_FORMAT_LABEL[preview.vacancy.workFormat] ?? preview.vacancy.workFormat}</Badge>
                  <Badge variant="secondary">
                    {EMPLOYMENT_TYPE_LABEL[preview.vacancy.employmentType] ?? preview.vacancy.employmentType}
                  </Badge>
                  {preview.vacancy.isHot && (
                    <Badge variant="destructive">
                      <Flame className="size-3" /> Срочно
                    </Badge>
                  )}
                  {preview.vacancy.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-5 px-6 py-5">
                {preview.vacancy.address && (
                  <p className="rounded-xl border bg-muted/40 p-3 text-sm">
                    <MapPin className="mr-1.5 inline size-3.5 text-muted-foreground" />
                    {preview.vacancy.city}, {preview.vacancy.address}
                    {preview.vacancy.addressDetails && (
                      <span className="block text-xs text-muted-foreground">{preview.vacancy.addressDetails}</span>
                    )}
                  </p>
                )}

                <p className="whitespace-pre-line text-sm leading-relaxed">{preview.vacancy.summary}</p>

                <PreviewSection title="Что нужно от кандидата" items={preview.vacancy.requirements} />
                <PreviewSection title="Условия и бонусы" items={preview.vacancy.perks} />
                <PreviewSection title="Чему научится студент" items={preview.vacancy.learnings} />

                {preview.vacancy.photos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {preview.vacancy.photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element -- превью произвольного файла со стороннего сервиса
                      <img
                        key={url}
                        src={studentsFileProxyUrl(url)}
                        alt=""
                        className="h-32 w-32 shrink-0 rounded-xl object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompanyCard({
  company,
  busy,
  onDecide,
}: {
  company: ModerationCompany;
  busy: boolean;
  onDecide: Decide;
}) {
  const website = company.website && /^https?:\/\//i.test(company.website) ? company.website : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Avatar>
            {company.logoUrl && <AvatarImage src={studentsFileProxyUrl(company.logoUrl)} alt="" />}
            <AvatarFallback>
              <Building2 className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{company.companyName}</p>
            <p className="text-xs text-muted-foreground">{company.city ?? "Город не указан"}</p>
          </div>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Контакт</dt>
            <dd>{company.contactName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Почта</dt>
            <dd className="break-all">
              <a href={`mailto:${company.email}`} className="hover:underline">
                {company.email}
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">ИНН</dt>
            <dd>
              {company.inn ? (
                <>
                  <span className="tabular-nums">{company.inn}</span>{" "}
                  <a
                    href="https://egrul.nalog.ru/index.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    проверить в ФНС
                  </a>
                </>
              ) : (
                "не указан"
              )}
            </dd>
          </div>
          {company.phone && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Телефон</dt>
              <dd>
                <a href={`tel:${company.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                  {company.phone}
                </a>
              </dd>
            </div>
          )}
          {website && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Сайт</dt>
              <dd className="min-w-0 break-all">
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                  {website}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {(company.freeEmail || !company.inn) && (
          <div className="flex flex-wrap gap-2">
            {company.freeEmail && <Badge variant="destructive">Почта не на домене компании</Badge>}
            {!company.inn && <Badge variant="destructive">Нет ИНН</Badge>}
          </div>
        )}

        {company.about ? (
          <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{company.about}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Страница компании пока не заполнена.</p>
        )}

        {company.pendingVacancies > 0 && (
          <p className="text-xs text-muted-foreground">На проверке {company.pendingVacancies} вакансий этой компании</p>
        )}

        <DecisionBar busy={busy} onDecide={onDecide} />
      </CardContent>
    </Card>
  );
}

function VacancyCard({
  item,
  busy,
  onPreview,
  onDecide,
}: {
  item: ModerationVacancy;
  busy: boolean;
  onPreview: () => void;
  onDecide: Decide;
}) {
  const { vacancy } = item;
  const companyReady = item.companyStatus === "APPROVED";

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{vacancy.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="size-3.5 shrink-0" />
              {vacancy.company}
              {!companyReady && (
                <Badge variant="destructive">Компания: {COMPANY_STATUS_LABEL[item.companyStatus]}</Badge>
              )}
            </p>
          </div>
        </div>

        <p className="text-sm text-primary">
          {money(vacancy.salaryFrom, vacancy.salaryTo)}
          <span className="text-muted-foreground"> · {vacancy.city}</span>
        </p>
        <p className="line-clamp-3 text-sm text-muted-foreground">{vacancy.summary}</p>

        <Button variant="ghost" size="sm" className="-ml-2" onClick={onPreview}>
          Открыть карточку, как у студента
        </Button>

        <DecisionBar
          busy={busy}
          approveBlockedReason={
            companyReady ? undefined : "Сначала одобрите компанию — без неё вакансия студентам не видна."
          }
          onDecide={onDecide}
        />
      </CardContent>
    </Card>
  );
}

function DecisionBar({
  busy,
  approveBlockedReason,
  onDecide,
}: {
  busy: boolean;
  approveBlockedReason?: string;
  onDecide: Decide;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  async function reject() {
    if (note.trim().length < 5) {
      setError("Напишите причину — хотя бы пару слов");
      return;
    }
    const done = await onDecide("REJECT", note.trim());
    if (done) {
      setRejecting(false);
      setNote("");
    }
  }

  if (rejecting) {
    return (
      <div className="space-y-2 border-t pt-3">
        <Textarea
          value={note}
          rows={2}
          placeholder="Причина отказа — компания увидит её в кабинете"
          onChange={(e) => {
            setNote(e.target.value);
            setError(undefined);
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void reject()}>
            <X /> Отклонить
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !!approveBlockedReason} onClick={() => void onDecide("APPROVE")}>
          <Check /> Одобрить
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
          <X /> Отклонить
        </Button>
      </div>
      {approveBlockedReason && <p className="mt-2 text-xs text-muted-foreground">{approveBlockedReason}</p>}
    </div>
  );
}

function PreviewSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
