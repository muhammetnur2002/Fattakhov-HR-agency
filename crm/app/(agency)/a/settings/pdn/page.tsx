import { EraseButton } from "@/components/pdn/erase-button";
import { ErasureQueue } from "@/components/pdn/erasure-queue";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  countOverdueErasures,
  listErasureQueue,
} from "@/lib/services/erasure";
import {
  ACCESS_ACTION_LABELS,
  listAccessLog,
  listForRetention,
} from "@/lib/services/pdn-retention";

export const metadata = { title: "Персональные данные" };

/**
 * ПДн-контур: очередь уничтожения, удаление сразу и журнал доступа.
 *
 * Только владелец (BR-36): журнал показывает, кто из сотрудников
 * что смотрел, и это отдельный уровень доверия.
 */
export default async function PdnPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "pdn.auditLog");

  const [log, retention, queue, overdue] = await Promise.all([
    listAccessLog(actor, { limit: 100 }),
    listForRetention(actor),
    listErasureQueue(actor),
    countOverdueErasures(actor.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Персональные данные</h1>
        <p className="text-sm text-muted-foreground">
          Очередь уничтожения, данные с истёкшим согласием и журнал доступа
        </p>
      </div>

      <Tabs
        defaultValue={
          queue.length > 0 ? "queue" : retention.length > 0 ? "retention" : "log"
        }
      >
        <TabsList>
          <TabsTrigger value="queue">
            Уничтожение
            {queue.length > 0 && (
              <Badge
                variant={overdue > 0 ? "destructive" : "secondary"}
                className="ml-2"
              >
                {queue.length}
              </Badge>
            )}
          </TabsTrigger>
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

        <TabsContent value="queue" className="space-y-4 pt-4">
          {overdue > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                Просрочен срок уничтожения: {overdue}. По статье 21 152-ФЗ
                данные должны быть уничтожены в течение тридцати дней
                с момента основания.
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Очередь уничтожения</CardTitle>
              <CardDescription>
                Обработка этих данных уже прекращена. Уничтожение произойдёт
                само по наступлении срока — кнопка нужна только чтобы
                не ждать его.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ErasureQueue items={queue} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Согласие истекло или отозвано
              </CardTitle>
              {/*
                Раньше здесь стояло «ничего не удаляется автоматически» —
                с контуром уничтожения это неправда: срок назначается сам
                и исполняется задачей. Эта вкладка — удаление сразу,
                не дожидаясь срока, и оно по-прежнему требует слова
              */}
              <CardDescription>
                Здесь можно удалить сразу, не дожидаясь срока. Если ничего
                не нажимать, эти данные всё равно уничтожит очередь в свой
                срок — он на вкладке «Уничтожение». Если согласие просто
                истекло, а кандидат ещё нужен, попросите его продлить:
                продление снимает блокировку.
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
                Кто открывал карточки кандидатов, скачивал файлы и смотрел
                справки и фото студентов (не чаще раза в 10 минут на один
                файл). Последние 100 записей.
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
                        {entry.actorRole && ` (${entry.actorRole.toLowerCase()})`}
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
