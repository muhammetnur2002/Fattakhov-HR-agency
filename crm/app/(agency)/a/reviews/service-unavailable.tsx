import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Служебный вызов на студенческую платформу упал — сеть, неверный или
 * не заданный CRM_SERVICE_SECRET/STUDENTS_URL. Раньше страница в этом
 * случае падала целиком (необработанное исключение из Server Component);
 * теперь показывает, что именно проверить, а не белый экран с Digest.
 */
export function ServiceUnavailable({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Студенческая платформа не ответила</AlertTitle>
      <AlertDescription>
        {message} Проверьте STUDENTS_URL и CRM_SERVICE_SECRET в переменных окружения обоих
        приложений — значение секрета должно совпадать в CRM и на студенческой платформе.
      </AlertDescription>
    </Alert>
  );
}
