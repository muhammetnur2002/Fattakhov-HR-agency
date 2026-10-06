import type { AccountAction } from "@/components/shared/account-forms";
import { withEmailOff } from "@/components/shared/email-off";
import { InviteLink } from "@/components/clients/invite-link";
import { RevokeInviteButton } from "@/components/settings/revoke-invite-button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format-date";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { ROLE_LABELS, STAFF_GRANT_LABELS } from "@/lib/labels";
import type { StaffGrant } from "@/lib/access";

export type PendingStaffInvitation = {
  id: string;
  email: string;
  role: UserRole;
  position: string | null;
  grants: StaffGrant[];
  expiresAt: Date;
  /** Ссылка — только тем, кто мог бы позвать так сам (listStaffInvitations). */
  url: string | null;
  revocable: boolean;
};

/**
 * «Ждут принятия» — приглашения в команду, по которым ещё никто не вошёл.
 *
 * Список нужен ради двух действий: передать ссылку, если письмо не дошло,
 * и отозвать приглашение, отправленное не туда. Без отзыва опечатка
 * в адресе стоила недели: повторно позвать тот же адрес нельзя, пока
 * живо прежнее приглашение, а ссылка из чужого письма всё это время
 * пускает в CRM. Ссылка скрыта по умолчанию (InviteLink) — экран команды
 * показывают на созвонах.
 */
export function StaffInvitations({
  invitations,
  revokeAction,
}: {
  invitations: PendingStaffInvitation[];
  revokeAction: AccountAction;
}) {
  return (
    <div className="space-y-4">
      {invitations.map((inv) => (
        <div key={inv.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-sm font-medium break-words">
                {withEmailOff(inv.email, inv.email)}
              </div>
              <div className="text-xs text-muted-foreground">
                {inv.position ? `${inv.position} · ` : ""}до {formatDate(inv.expiresAt)}
              </div>
            </div>
            <Badge variant="outline">{ROLE_LABELS[inv.role]}</Badge>
          </div>

          {inv.grants.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {inv.grants.map((grant) => (
                <Badge key={grant} variant="secondary">
                  {STAFF_GRANT_LABELS[grant].label}
                </Badge>
              ))}
            </div>
          )}

          {(inv.url || inv.revocable) && (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {inv.url ? (
                  <InviteLink url={inv.url} />
                ) : (
                  // Не прятать молча: без строки выглядит так, будто ссылку потеряли
                  <p className="py-1 text-xs text-muted-foreground">
                    Ссылку видит тот, кто мог бы выдать эту роль и эти доступы сам.
                  </p>
                )}
              </div>
              {inv.revocable && <RevokeInviteButton action={revokeAction} id={inv.id} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
