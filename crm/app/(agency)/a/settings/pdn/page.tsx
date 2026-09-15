import { EraseButton } from "@/components/pdn/erase-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import {
  ACCESS_ACTION_LABELS,
  listAccessLog,
  listForRetention,
} from "@/lib/services/pdn-retention";

export const metadata = { title: "Персональные данные" };

/**
 * ПДн-контур: журнал доступа и список на удаление.
 *
 * Только владелец (BR-36): журнал показывает, кто из сотрудников
 * что смотрел, и это отдельный уровень доверия.
 */
export default async function PdnPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "pdn.auditLog");

  const [log, retention] = await Promise.all([
    listAccessLog(actor, { limit: 100 }),
    listForRetention(actor),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Персональные данные</h1>
        <p className="text-sm text-muted-foreground">
          Журнал доступа и данные с истёкшим согласием
        </p>
      </div>

      <Tabs defaultValue={retention.length > 0 ? "retention" : "log"}>
        <TabsList>
          <TabsTrigger value="retention">
            Требуют решения
            {retention.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {retention.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="log">Журнал доступа</TabsTrigger>
        </TabsList>

        <TabsContent value="retention" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Согласие истекло или отозвано
              </CardTitle>
              <CardDescription>
                Ничего не удаляется автоматически: кандидат, чьё согласие
                истекло вчера, может завтра выйти на работу. Решение
                принимает человек.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {retention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Данных, требующих решения, нет.
                </p>
              ) : (
                retention.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="space-y-3 border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{candidate.fullName}</span>
                      <Badge variant="outline">
                        {candidate.consentStatus === "EXPIRED"
                          ? "согласие истекло"
                          : "согласие отозвано"}
                      </Badge>
                      {candidate.activeApplications > 0 && (
                        <Badge variant="secondary">
                          в работе: {candidate.activeApplications}
                        </Badge>
                      )}
                    </div>

                    <EraseButton
                      candidateId={candidate.id}
                      candidateName={candidate.fullName}
                      activeApplications={candidate.activeApplications}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Журнал доступа</CardTitle>
              <CardDescription>
                Кто из сотрудников открывал карточки кандидатов
                и скачивал файлы. Последние 100 записей.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Записей пока нет.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {log.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 last:border-0 last:pb-0"
                    >
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </span>
                      <span className="min-w-40 flex-1">
                        {ACCESS_ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="text-muted-foreground">
                        {entry.actorName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        → {entry.candidateName}
                      </span>
                      {entry.ip && (
                        <span className="text-xs text-muted-foreground">
                          {entry.ip}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
