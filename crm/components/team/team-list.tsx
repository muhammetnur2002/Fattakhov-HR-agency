"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import type { AccountAction } from "@/components/shared/account-forms";
import { withEmailOff } from "@/components/shared/email-off";
import { ResetTwoFactorDialog } from "@/components/team/reset-two-factor-dialog";
import { StaffMemberEditor, type TeamOption } from "@/components/team/staff-forms";
import { PresenceLabel } from "@/components/presence/presence-label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, STAFF_GRANT_LABELS } from "@/lib/labels";
import type { StaffMember } from "@/lib/services/staff";

/** Список команды с поиском — на десяток человек не нужен, на полсотни уже да. */
export function TeamList({
  members,
  roles,
  grants,
  updateAction,
  activeAction,
  resetPasswordAction,
  resetTwoFactorAction,
}: {
  members: StaffMember[];
  roles: TeamOption[];
  grants: TeamOption[];
  updateAction: AccountAction;
  activeAction: AccountAction;
  resetPasswordAction: AccountAction;
  /** Только у владельца: сбросить сотруднику 2FA. */
  resetTwoFactorAction?: AccountAction;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? members.filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.position ?? "").toLowerCase().includes(q),
      )
    : members;

  return (
    <div className="space-y-5">
      {members.length > 5 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя, почта, должность…"
            className="pl-8"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ничего не нашлось по этому запросу.</p>
      ) : (
        visible.map((member) => (
          <div key={member.id} className="space-y-2.5 border-b pb-5 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="text-sm font-medium">
                  {member.fullName}
                  {member.isSelf && <span className="font-normal text-muted-foreground"> · это вы</span>}
                </div>
                <div className="text-xs break-words text-muted-foreground">
                  {withEmailOff(member.email, member.email)}
                  {member.position ? ` · ${member.position}` : ""}
                </div>
              </div>
              <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
              {!member.isActive && <Badge variant="destructive">Доступ отключён</Badge>}
              {member.isActive && !member.twoFactorEnabled && (
                <Badge variant="outline">2FA не настроена</Badge>
              )}
              <div className="flex flex-col items-end text-xs text-muted-foreground">
                {member.presence && (
                  <PresenceLabel lastSeenAt={member.presence.lastSeenAt} />
                )}
                <span>
                  {member.lastLoginAt ? `Заходил ${formatDate(member.lastLoginAt)}` : "Ни разу не заходил"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {member.role === "OWNER" ? (
                <Badge variant="secondary">Все доступы</Badge>
              ) : member.grants.length === 0 ? (
                <span className="text-xs text-muted-foreground">Дополнительных доступов нет</span>
              ) : (
                member.grants.map((grant) => (
                  <Badge key={grant} variant="secondary">
                    {STAFF_GRANT_LABELS[grant].label}
                  </Badge>
                ))
              )}
            </div>

            {member.manageable && (
              <StaffMemberEditor
                member={member}
                roles={roles}
                grants={grants}
                updateAction={updateAction}
                activeAction={activeAction}
                resetPasswordAction={resetPasswordAction}
              />
            )}

            {resetTwoFactorAction && !member.isSelf && member.twoFactorEnabled && (
              <ResetTwoFactorDialog member={member} action={resetTwoFactorAction} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
