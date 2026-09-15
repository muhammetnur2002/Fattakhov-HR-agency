import { prisma } from "@/lib/db/prisma";
import { plural } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/notify";
import { clientDigestRecipients } from "@/lib/notifications/recipients";

/**
 * Еженедельная сводка клиенту (ТЗ 9.3).
 *
 * Главный инструмент удержания внимания: клиент, который не заходит
 * в кабинет неделю, всё равно видит, что работа идёт. Поэтому письмо
 * короткое и про движение, а не про статус.
 *
 * Отправляется в понедельник утром. Идемпотентность — по факту
 * существования уведомления за текущую неделю: повторный запуск
 * планировщика не пришлёт вторую сводку.
 */
export async function sendWeeklyDigest(now: Date = new Date()): Promise<number> {
  // Только по понедельникам: в остальные дни задача ничего не делает
  if (now.getDay() !== 1) return 0;

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const vacancies = await prisma.vacancy.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      number: true,
      title: true,
      organizationId: true,
      clientId: true,
    },
  });

  // Группируем по клиенту: одно письмо на компанию, а не на вакансию
  const byClient = new Map<string, typeof vacancies>();
  for (const vacancy of vacancies) {
    byClient.set(vacancy.clientId, [
      ...(byClient.get(vacancy.clientId) ?? []),
      vacancy,
    ]);
  }

  let sent = 0;

  for (const [clientId, clientVacancies] of byClient) {
    const lines: string[] = [];
    let anyMovement = false;
    let waitingTotal = 0;

    for (const vacancy of clientVacancies) {
      const [presented, interviews, waiting] = await Promise.all([
        prisma.application.count({
          where: { vacancyId: vacancy.id, presentedAt: { gte: weekAgo } },
        }),
        prisma.interview.count({
          where: {
            vacancyId: vacancy.id,
            status: { in: ["CONFIRMED", "COMPLETED"] },
            scheduledAt: { gte: weekAgo, lte: now },
          },
        }),
        prisma.application.count({
          where: {
            vacancyId: vacancy.id,
            presentedAt: { not: null },
            clientDecision: null,
            outcome: "IN_PROGRESS",
          },
        }),
      ]);

      waitingTotal += waiting;
      if (presented > 0 || interviews > 0) anyMovement = true;

      const parts: string[] = [];
      if (presented > 0) {
        parts.push(
          `${presented} ${plural(presented, "новый кандидат", "новых кандидата", "новых кандидатов")}`,
        );
      }
      if (interviews > 0) {
        parts.push(
          `${interviews} ${plural(interviews, "интервью", "интервью", "интервью")}`,
        );
      }
      if (waiting > 0) {
        parts.push(`${waiting} ждут вашего решения`);
      }

      lines.push(
        `№${vacancy.number} ${vacancy.title}: ${parts.length > 0 ? parts.join(", ") : "без движения"}`,
      );
    }

    // Письмо «за неделю ничего не произошло» бесполезно и раздражает
    if (!anyMovement && waitingTotal === 0) continue;

    /*
      Получателей собираем со всех вакансий клиента, а не с первой
      попавшейся (раньше здесь стоял clientSideRecipients(clientVacancies[0].id) —
      нанимающие менеджеры остальных вакансий клиента в сводку не попадали,
      даже когда движение было именно по их вакансии). См. clientDigestRecipients.
    */
    const recipients = await clientDigestRecipients(
      clientVacancies.map((v) => v.id),
    );
    if (recipients.length === 0) continue;

    const weekKey = `digest:${clientId}:${weekNumber(now)}`;

    const already = await prisma.notification.findFirst({
      where: { eventCode: "WEEKLY_DIGEST", groupKey: weekKey },
      select: { id: true },
    });
    if (already) continue;

    await notify({
      organizationId: clientVacancies[0].organizationId,
      userIds: recipients,
      event: "WEEKLY_DIGEST",
      title:
        waitingTotal > 0
          ? `Итоги недели: ${waitingTotal} ${plural(waitingTotal, "кандидат ждёт", "кандидата ждут", "кандидатов ждут")} вашего решения`
          : "Итоги недели по вашим вакансиям",
      body: lines.join("\n"),
      linkUrl: "/",
      groupKey: weekKey,
    });

    sent++;
  }

  return sent;
}

/** Номер недели — чтобы одна сводка на неделю, а не на каждый запуск. */
function weekNumber(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return `${date.getFullYear()}-${Math.ceil((days + start.getDay() + 1) / 7)}`;
}
