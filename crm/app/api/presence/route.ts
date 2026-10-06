import { NextResponse } from "next/server";

import { getActor } from "@/lib/auth/session";
import { guardRate } from "@/lib/security/guard";
import { touchPresence } from "@/lib/services/presence";

/**
 * Пульс «в сети»: открытая вкладка кабинета раз в минуту (и при возврате
 * на вкладку) сообщает, что человек здесь.
 * Вызывает components/presence/presence-heartbeat.tsx.
 *
 * Человек — только из сессии (getActor): ни id, ни чего-либо о нём из тела
 * запроса не принимается, и отметить чужое присутствие нельзя. Без входа —
 * 401 (прокси такие запросы и так уводит на /login, сюда они не доходят).
 * В базу запись идёт не чаще раза в минуту на человека
 * (lib/services/presence.ts); здесь — только рубеж по частоте от
 * зациклившегося клиента.
 *
 * Ответ пустой: ни статуса, ни времени. Что показывать другим людям,
 * решает сервер при отрисовке их экранов, а не этот маршрут.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });

  const rate = await guardRate("presence", actor.id);
  if (!rate.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfter) },
    });
  }

  await touchPresence(actor.id);
  return new NextResponse(null, { status: 204 });
}
