import { requireClientActor } from "@/lib/auth/session";
import { fetchStudentsSummary } from "@/lib/students-service";
import { StudentsTabs } from "./students-tabs";

export default async function StudentsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireClientActor();
  // Значки на вкладках: если платформа не ответила — вкладки просто без чисел
  const summary = actor.clientId ? await fetchStudentsSummary(actor.clientId) : null;

  return (
    <div className="space-y-5">
      <StudentsTabs
        newApplications={summary?.newApplications ?? 0}
        unreadMessages={summary?.unreadMessages ?? 0}
      />
      {children}
    </div>
  );
}
