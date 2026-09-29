import { Alert, AlertDescription } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import {
  fetchEmployerApplications,
  StudentsServiceError,
  type EmployerApplication,
} from "@/lib/students-service";
import { ApplicationsList } from "./applications-list";

export const metadata = { title: "Отклики студентов" };

/**
 * Отклики студентов на вакансии клиента — тут же в CRM, без перехода на
 * студенческую платформу. Данные приходят служебным вызовом (см.
 * lib/students-service.ts), контакты раскрыты тем же правилом, что и в
 * кабинете компании на платформе: студент сам откликнулся на вакансию.
 */
export default async function StudentsApplicationsPage() {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  let applications: EmployerApplication[] = [];
  let error: string | null = null;
  try {
    applications = await fetchEmployerApplications(actor.clientId);
  } catch (err) {
    error = err instanceof StudentsServiceError ? err.message : "Не удалось загрузить отклики";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Отклики студентов</h1>
        <p className="text-sm text-muted-foreground">
          Студенты, которые откликнулись на ваши вакансии. Новый отклик станет «просмотренным», когда вы откроете карточку.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <ApplicationsList applications={applications} />
      )}
    </div>
  );
}
