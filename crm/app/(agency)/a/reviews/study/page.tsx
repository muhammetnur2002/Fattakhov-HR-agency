import Link from "next/link";
import { notFound } from "next/navigation";

import { StudyBoard } from "./study-board";
import { Button } from "@/components/ui/button";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { fetchPendingStudyReview } from "@/lib/students-service";

export const metadata = { title: "Справки студентов" };

export default async function StudyReviewPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.study")) notFound();

  const students = await fetchPendingStudyReview();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/reviews">← Проверки</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Справки студентов</h1>
        <p className="text-sm text-muted-foreground">
          Загруженные справки об обучении — подтверждают учёбу студента перед откликами работодателям.
        </p>
      </div>

      <StudyBoard students={students} />
    </div>
  );
}
