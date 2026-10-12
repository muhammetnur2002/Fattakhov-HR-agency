import { notFound } from "next/navigation";

import { ModerationBoard } from "./moderation-board";
import { ServiceUnavailable } from "../service-unavailable";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import {
  fetchModerationQueue,
  StudentsServiceError,
} from "@/lib/students-service";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Компании и вакансии" };

export default async function ModerationReviewPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.moderation")) notFound();

  let queue;
  try {
    queue = await fetchModerationQueue();
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
      <ModerationBoard companies={queue.companies} vacancies={queue.vacancies} />
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
        <PageTitle>Компании и вакансии</PageTitle>
        <p className="text-sm text-muted-foreground">
          Компании, зарегистрированные самостоятельно, и их вакансии — до решения студенты их не видят.
        </p>
      </div>
    </>
  );
}
