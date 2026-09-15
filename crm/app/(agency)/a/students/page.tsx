import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { STAFF_GRANT_LABELS } from "@/lib/labels";
import { studentsSsoSecret } from "@/lib/students-sso";
import { studentsUrl } from "@/lib/urls";

export const metadata = { title: "Студенческая платформа" };

/**
 * Вход в панель студенческой платформы.
 *
 * Отдельная страница, а не пункт меню со ссылкой наружу: человек видит,
 * какие разделы ему выданы, и уходит из CRM осознанно — нажатием.
 */
export default async function StudentsPlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");

  const { error } = await searchParams;
  const sections = effectiveGrants(actor).filter((grant) =>
    grant.startsWith("students."),
  );
  const configured = Boolean(studentsSsoSecret() && studentsUrl("/"));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Студенческая платформа</h1>
        <p className="text-sm text-muted-foreground">
          Проверка компаний и вакансий, справок студентов и метрики пилота.
          Вход — по вашей учётной записи в CRM, второй пароль не нужен.
        </p>
      </div>

      {(!configured || error === "config") && (
        <Alert variant="destructive">
          <AlertDescription>
            Вход не настроен: в .env нужны STUDENTS_URL и STUDENTS_SSO_SECRET,
            причём секрет — тот же, что в студенческой платформе.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ваши разделы</CardTitle>
          <CardDescription>
            Доступы выдаёт владелец в разделе «Сотрудники».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-3">
            {sections.map((grant) => (
              <li key={grant} className="text-sm">
                <div className="font-medium">{STAFF_GRANT_LABELS[grant].label}</div>
                <div className="text-muted-foreground">{STAFF_GRANT_LABELS[grant].hint}</div>
              </li>
            ))}
          </ul>

          <form method="post" action="/a/students/open">
            <Button type="submit" disabled={!configured}>
              Открыть студенческую платформу
            </Button>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Откроется в этой же вкладке. Там сессия живёт до восьми часов;
            если доступ отключат, войти заново уже не получится.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
