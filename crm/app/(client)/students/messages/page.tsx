import { Alert, AlertDescription } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { getStudentDraft, loadEmployerThreadList } from "@/lib/services/student-drafts";
import { fetchStudentThread, StudentsServiceError } from "@/lib/students-service";
import type { StudentThreadItem, StudentThreadView } from "@/lib/students-threads";
import { StudentMessages } from "./student-messages";

export const metadata = { title: "Сообщения студентам" };

/**
 * Переписка клиента со студентами — тут же в CRM, без перехода на
 * студенческую платформу. Читает её только сам клиент под своим входом:
 * сотрудники агентства в эту переписку не входят (см. lib/chat.ts на
 * платформе), сюда попадают люди клиента и никто больше.
 *
 * В списке — только беседы с сообщениями или с черновиком этого пользователя.
 * Беседа без сообщений открывается по ссылке ?thread= («Написать студенту» в
 * анкете отклика): отклик должен быть среди откликов клиента, иначе её нет.
 */
export default async function StudentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  const { thread: requested } = await searchParams;

  let threads: StudentThreadItem[] = [];
  let initial: StudentThreadView | null = null;
  let error: string | null = null;
  try {
    const list = await loadEmployerThreadList(actor.id, actor.clientId);
    threads = list.items;
    const valid = requested && list.all.some((t) => t.applicationId === requested) ? requested : null;
    if (valid) {
      const thread = await fetchStudentThread(actor.clientId, valid);
      if (thread) initial = { ...thread, draft: (await getStudentDraft(actor.id, valid))?.body ?? "" };
    }
  } catch (err) {
    error = err instanceof StudentsServiceError ? err.message : "Не удалось загрузить переписку";
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return <StudentMessages initialThreads={threads} initialThread={initial} />;
}
