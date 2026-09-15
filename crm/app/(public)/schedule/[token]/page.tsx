import { MapPin, Video } from "lucide-react";

import { RateLimitCard } from "@/components/shared/rate-limit-card";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { guardRate } from "@/lib/security/guard";
import { getInterviewByToken } from "@/lib/services/interviews";

export const metadata = { title: "Выбор времени интервью" };

/**
 * Страница выбора времени для кандидата.
 *
 * Без авторизации: у кандидата нет аккаунта в системе и не будет (ТЗ 2.2).
 * Вся защита — в токене: он одноразовый по смыслу и живёт неделю.
 */
export default async function SchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rate = await guardRate("publicToken");
  if (!rate.allowed) return <RateLimitCard retryAfter={rate.retryAfter} />;

  // Часы спрашиваем один раз на страницу — см. SlotPicker: по этому
  // моменту он отличает прошедшие варианты от доступных
  const now = new Date();

  const interview = await getInterviewByToken(token);

  // Одно и то же сообщение на просроченную, использованную и выдуманную
  // ссылку: по ответу нельзя понять, существовала ли она
  if (!interview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Возможно, время уже выбрано или срок ссылки истёк. Напишите
            рекрутеру — он пришлёт новую.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const alreadyConfirmed = interview.status === "CONFIRMED";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {alreadyConfirmed ? "Встреча назначена" : "Выберите удобное время"}
        </CardTitle>
        <CardDescription>
          Интервью на позицию «{interview.vacancy.title}» в компании{" "}
          {interview.vacancy.client.name}.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
          <div className="flex items-center gap-2">
            {interview.format === "ONLINE" ? (
              <>
                <Video className="size-4 shrink-0" />
                Онлайн-встреча, {interview.durationMinutes} минут
              </>
            ) : (
              <>
                <MapPin className="size-4 shrink-0" />
                {interview.address ?? "Встреча в офисе"},{" "}
                {interview.durationMinutes} минут
              </>
            )}
          </div>

          {interview.participants.length > 0 && (
            <div>
              <span className="text-muted-foreground">Кто будет: </span>
              {interview.participants
                .map((p) => [p.fullName, p.position].filter(Boolean).join(", "))
                .join(" · ")}
            </div>
          )}
        </div>

        {alreadyConfirmed && interview.scheduledAt ? (
          <div className="space-y-3">
            <p className="text-sm">
              Время подтверждено:{" "}
              <span className="font-medium">
                {formatFull(interview.scheduledAt, interview.timezone)}
              </span>
            </p>
            {/* Кандидат часто возвращается по ссылке из письма позже —
                кнопка нужна и здесь, не только сразу после выбора */}
            <Button asChild variant="outline" className="w-full">
              <a href={`/api/calendar/interview.ics?token=${token}`}>
                Добавить в календарь
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Нужно перенести — напишите рекрутеру.
            </p>
          </div>
        ) : (
          <SlotPicker
            token={token}
            durationMinutes={interview.durationMinutes}
            now={now.getTime()}
            slots={interview.slots.map((s) => ({
              id: s.id,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

function formatFull(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
