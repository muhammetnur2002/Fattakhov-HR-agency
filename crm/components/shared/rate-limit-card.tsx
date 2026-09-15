import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rateLimitMessage } from "@/lib/security/guard";

/**
 * Ответ на превышение частоты для публичных страниц по токену
 * (schedule/consent/invite/reset — см. LIMITS.publicToken).
 *
 * Отдельная карточка, а не переиспользование «Ссылка недействительна»:
 * это разные факты. Недействительная ссылка не заработает, сколько ни жди,
 * а здесь через минуту всё откроется само — смешивать эти сообщения
 * значит один раз в отчаянии подсказать человеку писать за новой ссылкой
 * там, где просто нужно подождать.
 */
export function RateLimitCard({ retryAfter }: { retryAfter: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Слишком много попыток</CardTitle>
        <CardDescription>{rateLimitMessage(retryAfter)}</CardDescription>
      </CardHeader>
    </Card>
  );
}
