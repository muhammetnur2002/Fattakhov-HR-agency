import { Alert, AlertDescription } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import {
  fetchStudentThread,
  fetchStudentThreads,
  StudentsServiceError,
  type StudentThread,
  type StudentThreadSummary,
} from "@/lib/students-service";
import { StudentMessages } from "./student-messages";

export const metadata = { title: "Сообщения студентам" };

/**
 * Переписка клиента со студентами — тут же в CRM, без перехода на
 * студенческую платформу. Читает её только сам клиент под своим входом:
 * сотрудники агентства в эту переписку не входят (см. lib/chat.ts на
 * платформе), сюда попадают люди клиента и никто больше.
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

  let threads: StudentThreadSummary[] = [];
  let initial: StudentThread | null = null;
  let error: string | null = null;
  try {
    threads = await fetchStudentThreads(actor.clientId);
    const valid = requested && threads.some((t) => t.applicationId === requested) ? requested : null;
    if (valid) initial = await fetchStudentThread(actor.clientId, valid);
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
