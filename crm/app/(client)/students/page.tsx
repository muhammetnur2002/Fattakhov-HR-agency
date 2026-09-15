import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { studentsSsoSecret } from "@/lib/students-sso";
import { studentsUrl } from "@/lib/urls";

export const metadata = { title: "Студенческая платформа" };

/**
 * Вход клиента на студенческую платформу — тем же паролем, что и в CRM.
 * Компанию агентство уже проверило (договор), поэтому вакансия публикуется
 * сразу, без очереди модерации — как и вакансии, которые заводит из CRM
 * само агентство.
 */
export default async function ClientStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");

  const { error } = await searchParams;
  const configured = Boolean(studentsSsoSecret() && studentsUrl("/"));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Студенческая платформа</h1>
        <p className="text-sm text-muted-foreground">
          Публикуйте вакансии для студентов напрямую — вход по вашей учётной
          записи, второй пароль не нужен.
        </p>
      </div>

      {(!configured || error === "config") && (
        <Alert variant="destructive">
          <AlertDescription>
            Вход пока не настроен — обратитесь в агентство.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Кабинет компании</CardTitle>
          <CardDescription>
            Компания уже проверена агентством — вакансия публикуется сразу.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form method="post" action="/students/open">
            <Button type="submit" disabled={!configured}>
              Открыть студенческую платформу
            </Button>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Откроется в этой же вкладке, сразу в форме новой вакансии.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
