import { notFound } from "next/navigation";

import { StudyBoard } from "./study-board";
import { ServiceUnavailable } from "../service-unavailable";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import {
  fetchPendingStudyReview,
  StudentsServiceError,
} from "@/lib/students-service";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Справки студентов" };

export default async function StudyReviewPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.study")) notFound();

  let students;
  try {
    students = await fetchPendingStudyReview();
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return (
      <div className="space-y-6">
        <Header />
        <ServiceUnavailable message={error.message} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      <StudyBoard students={students} />
    </div>
  );
}

function Header() {
  return (
    <>
      <div className="flex">
        <BackLink href="/a/reviews" className="mb-0">
          Студенческая платформа
        </BackLink>
      </div>

      <div>
        <PageTitle>Справки студентов</PageTitle>
        <p className="text-sm text-muted-foreground">
          Загруженные справки об обучении — подтверждают учёбу студента перед откликами работодателям.
        </p>
      </div>
    </>
  );
}
