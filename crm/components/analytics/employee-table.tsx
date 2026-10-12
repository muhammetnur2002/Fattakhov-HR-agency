import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/labels";
import {
  FINALISTS_PREVIEW,
  type EmployeeStats,
} from "@/lib/services/analytics/employees";
import { cn } from "@/lib/utils";

/** Бейдж «Финал»: число финалистов и до трёх имён во всплывающей подсказке. */
export function FinalBadge({ finalists }: { finalists: EmployeeStats["finalists"] }) {
  if (finalists.length === 0) return null;
  const names = finalists.slice(0, FINALISTS_PREVIEW).map((f) => f.fullName);
  const rest = finalists.length - names.length;
  const title = `${names.join(", ")}${rest > 0 ? ` и ещё ${rest}` : ""}`;
  return (
    <Badge variant="secondary" title={title} data-testid="final-badge">
      Финал: {finalists.length}
    </Badge>
  );
}

/** Таблица сотрудников внизу аналитики агентства. */
export function EmployeeTable({
  employees,
  range,
}: {
  employees: EmployeeStats[];
  range: string;
}) {
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">Сотрудников нет.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {employees.map((e) => (
        <li key={e.id}>
          <Link
            href={`/a/analytics/employees/${e.id}?range=${range}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.fullName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[e.role]}
              </div>
            </div>
            <FinalBadge finalists={e.finalists} />
            <dl className="flex gap-4 tabular-nums">
              <div>
                <dt className="text-xs text-muted-foreground">В работе</dt>
                <dd>{e.activeCandidates}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Представил</dt>
                <dd>{e.presented}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Нанято</dt>
                <dd>{e.hired}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Задания</dt>
                <dd className={cn(e.tasksOverdue > 0 && "font-medium text-destructive")}>
                  {e.tasksOpen}
                  {e.tasksOverdue > 0 ? ` (−${e.tasksOverdue})` : ""}
                </dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
