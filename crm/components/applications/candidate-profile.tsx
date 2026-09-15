import { FileText } from "lucide-react";

import { withEmailOff } from "@/components/shared/email-off";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/pricing";
import { buildSignedUrl } from "@/lib/storage/signing";

export type ProfileCandidate = {
  fullName: string;
  currentPosition: string | null;
  currentCompany: string | null;
  city: string | null;
  totalExperienceYears: unknown;
  salaryExpectation: unknown;
  skills: string[];
  education: string | null;
  phone: string | null;
  email: string | null;
  telegram: string | null;
};

export type ProfileAttachment = {
  id: string;
  kind: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
};

/**
 * Профиль кандидата.
 *
 * `showContacts` разделяет две ситуации: агентство видит телефон и почту
 * всегда, клиент — нет. Контакт кандидата это и есть товар агентства;
 * отдавать его до найма означает работать бесплатно.
 *
 * Исходного резюме у клиента не будет никогда: список вложений приходит
 * уже отфильтрованным слоем доступа. Клиент работает с профилем из
 * структурированных полей выше - в нём нет домашнего адреса, даты
 * рождения и прочего, что кандидат вписал в свой файл, но что клиенту
 * для решения не нужно (P0-5 юридического пакета).
 */
export function CandidateProfile({
  candidate,
  attachments,
  showContacts,
}: {
  candidate: ProfileCandidate;
  attachments: ProfileAttachment[];
  showContacts: boolean;
}) {
  const resumes = attachments.filter((a) => a.kind === "RESUME");

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Row label="Текущая позиция">
          {[candidate.currentPosition, candidate.currentCompany]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Row>
        <Row label="Город">{candidate.city ?? "—"}</Row>
        <Row label="Опыт">
          {candidate.totalExperienceYears != null
            ? `${Number(candidate.totalExperienceYears)} лет`
            : "—"}
        </Row>
        <Row label="Зарплатное ожидание">
          {candidate.salaryExpectation != null
            ? `${formatNumber(Number(candidate.salaryExpectation))} ₽`
            : "—"}
        </Row>

        {showContacts && (
          <>
            <Row label="Телефон">{formatPhone(candidate.phone)}</Row>
            <Row label="Почта">
              {candidate.email ? withEmailOff(candidate.email, candidate.email) : "—"}
            </Row>
            {candidate.telegram && (
              <Row label="Telegram">{candidate.telegram}</Row>
            )}
          </>
        )}

        {candidate.education && (
          <Row label="Образование" wide>
            {candidate.education}
          </Row>
        )}
      </dl>

      {candidate.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidate.skills.map((s) => (
            <Badge key={s} variant="secondary" className="font-normal">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Клиенту объясняем отсутствие файла, а не оставляем гадать:
          иначе первый же вопрос будет «а где резюме» */}
      {!showContacts && resumes.length === 0 && (
        <p className="rounded-lg bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
          Исходный файл резюме не передаётся: он содержит сведения, которые
          для рассмотрения кандидата не нужны. Выше — профиль, собранный
          из проверенных полей. Если по опыту нужны подробности, спросите
          в обсуждении, мы уточним у кандидата.
        </p>
      )}

      {resumes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Резюме</div>
          {resumes.map((file) => (
            <Button key={file.id} asChild variant="outline" size="sm">
              {/* Ссылка подписанная и живёт 15 минут (BR-37) */}
              <a
                href={buildSignedUrl(file.storageKey)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="size-4" />
                {file.fileName}
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
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

/** 79991234567 → +7 999 123-45-67 */
function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length !== 11) return phone;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}
