import Link from "next/link";
import { requireClientActor } from "@/lib/auth/session";
import { studentsUrl } from "@/lib/urls";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";

/** Legacy bookmarks must not open a second employer workspace inside CRM. */
export default async function StudentsLayout() {
  await requireClientActor();
  const target = studentsUrl("/employer");
  return (
    <div className="space-y-6">
      <PageTitle>Кабинет работодателя перенесён</PageTitle>
      <p className="text-sm text-muted-foreground">
        Вакансии для студентов, отклики, кандидаты и переписка находятся на студенческой платформе.
      </p>
      {target && <Button asChild><Link href={target}>Открыть кабинет работодателя</Link></Button>}
    </div>
  );
}
