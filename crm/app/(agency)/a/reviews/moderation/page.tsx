import Link from "next/link";
import { notFound } from "next/navigation";

import { ModerationBoard } from "./moderation-board";
import { ServiceUnavailable } from "../service-unavailable";
import { Button } from "@/components/ui/button";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { fetchModerationQueue, StudentsServiceError } from "@/lib/students-service";

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
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/reviews">← Проверки</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Компании и вакансии</h1>
        <p className="text-sm text-muted-foreground">
          Компании, зарегистрированные самостоятельно, и их вакансии — до решения студенты их не видят.
        </p>
      </div>
    </>
  );
}
