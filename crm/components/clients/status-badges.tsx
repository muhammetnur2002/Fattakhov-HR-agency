import { StatusBadge } from "@/components/ui/status-badge";
import type { AgreementStatus, ClientStatus } from "@/lib/generated/prisma/enums";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import { AGREEMENT_STATUS_TONE, CLIENT_STATUS_TONE } from "@/lib/status-tones";

/** Статус клиента: «Активный» зелёный, «Лид» в работе, пауза и архив — нейтральные. */
export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <StatusBadge tone={CLIENT_STATUS_TONE[status]}>{CLIENT_STATUS_LABELS[status]}</StatusBadge>;
}

const LABELS: Record<AgreementStatus, string> = {
  PENDING: "Ждёт подтверждения",
  ACTIVE: "Договор действует",
  EXPIRED: "Договор истёк",
  TERMINATED: "Договор расторгнут",
};

/** В списке договоров самого клиента слово «Договор» лишнее: он уже в заголовке карточки. */
const SHORT_LABELS: Record<AgreementStatus, string> = {
  PENDING: "Ждёт подтверждения",
  ACTIVE: "Действует",
  EXPIRED: "Истёк",
  TERMINATED: "Расторгнут",
};

/**
 * Статус договора. Один компонент на список клиентов и карточку клиента: раньше их было два,
 * с разными подписями и цветами (в одном «ждёт подтверждения» красное, в другом тоже, но
 * «действует» — залитое, а там — контурное). `null` — договора нет совсем.
 *
 * «Ждёт подтверждения» — задача аккаунт-менеджеру, но не ошибка и не просрочка: жёлтое.
 */
export function AgreementStatusBadge({
  status,
  short = false,
}: {
  status: string | null;
  short?: boolean;
}) {
  if (!status || !(status in AGREEMENT_STATUS_TONE)) {
    return <StatusBadge tone="neutral">Без договора</StatusBadge>;
  }
  const known = status as AgreementStatus;
  return (
    <StatusBadge tone={AGREEMENT_STATUS_TONE[known]}>
      {(short ? SHORT_LABELS : LABELS)[known]}
    </StatusBadge>
  );
}
