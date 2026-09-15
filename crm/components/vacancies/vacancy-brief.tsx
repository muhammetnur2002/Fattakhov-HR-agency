import { formatDate } from "@/lib/format-date";
import {
  EMPLOYMENT_TYPE_LABELS,
  URGENCY_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/labels";
import { formatNumber } from "@/lib/pricing";

/** Поля брифа, показываемые обеим сторонам. Внутренних заметок здесь нет. */
export type BriefData = {
  department: string | null;
  headcount: number;
  reasonForHire: string | null;
  urgency: keyof typeof URGENCY_LABELS;
  desiredStartDate: Date | null;
  responsibilities: string | null;
  requirements: string | null;
  niceToHave: string | null;
  stopFactors: string | null;
  targetCompanies: string | null;
  salaryFrom: unknown;
  salaryTo: unknown;
  salaryGross: boolean;
  bonusScheme: string | null;
  city: string | null;
  workFormat: keyof typeof WORK_FORMAT_LABELS | null;
  employmentType: keyof typeof EMPLOYMENT_TYPE_LABELS | null;
  workSchedule: string | null;
  conditions: string | null;
  interviewStages: string | null;
};

export function VacancyBrief({
  brief,
  hiringManagerName,
}: {
  brief: BriefData;
  hiringManagerName?: string | null;
}) {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
      <Row label="Подразделение">{brief.department ?? "—"}</Row>
      <Row label="Заказчик">{hiringManagerName ?? "—"}</Row>
      <Row label="Человек нужно">{brief.headcount}</Row>
      <Row label="Срочность">{URGENCY_LABELS[brief.urgency]}</Row>
      <Row label="Вилка">{formatSalary(brief)}</Row>
      <Row label="Город">{brief.city ?? "—"}</Row>
      <Row label="Формат работы">
        {brief.workFormat ? WORK_FORMAT_LABELS[brief.workFormat] : "—"}
      </Row>
      <Row label="Тип занятости">
        {brief.employmentType
          ? EMPLOYMENT_TYPE_LABELS[brief.employmentType]
          : "—"}
      </Row>
      {brief.workSchedule && <Row label="График">{brief.workSchedule}</Row>}
      {brief.desiredStartDate && (
        <Row label="Желаемая дата выхода">
          {formatDate(brief.desiredStartDate)}
        </Row>
      )}

      {brief.reasonForHire && (
        <Row label="Почему открыта" wide>
          {brief.reasonForHire}
        </Row>
      )}
      <Row label="Обязанности" wide>
        {brief.responsibilities ?? "— не заполнено"}
      </Row>
      <Row label="Требования" wide>
        {brief.requirements ?? "— не заполнено"}
      </Row>
      {brief.niceToHave && (
        <Row label="Будет плюсом" wide>
          {brief.niceToHave}
        </Row>
      )}
      {brief.stopFactors && (
        <Row label="Стоп-факторы" wide>
          {brief.stopFactors}
        </Row>
      )}
      {brief.targetCompanies && (
        <Row label="Откуда искать" wide>
          {brief.targetCompanies}
        </Row>
      )}
      {brief.bonusScheme && (
        <Row label="Бонусная схема" wide>
          {brief.bonusScheme}
        </Row>
      )}
      {brief.conditions && (
        <Row label="Что предлагает компания" wide>
          {brief.conditions}
        </Row>
      )}
      {brief.interviewStages && (
        <Row label="Процесс отбора" wide>
          {brief.interviewStages}
        </Row>
      )}
    </dl>
  );
}

function Row({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function formatSalary(brief: BriefData): string {
  const from = brief.salaryFrom == null ? null : Number(brief.salaryFrom);
  const to = brief.salaryTo == null ? null : Number(brief.salaryTo);
  if (from === null && to === null) return "—";

  const suffix = brief.salaryGross ? "gross" : "на руки";
  if (from !== null && to !== null) {
    return `${formatNumber(from)} – ${formatNumber(to)} ₽ ${suffix}`;
  }
  return `${formatNumber((from ?? to) as number)} ₽ ${suffix}`;
}
