"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  isAccepted,
  subscribe,
} from "@/lib/analytics/consent";

/**
 * Яндекс.Метрика.
 *
 * Подключается только на маркетинговых страницах и только после
 * явного согласия. Два ограничения, и оба существенные.
 *
 * Первое: счётчик не должен появляться в кабинетах и на страницах
 * кандидата (согласие на обработку, выбор времени интервью,
 * приглашение). Там человек вводит персональные данные, и пускать
 * туда сторонний сервис значит своими руками отдать ему то, что
 * по выбранной архитектуре наружу не уходит вовсе.
 *
 * Второе: до согласия не грузится сам файл счётчика. «Загрузить,
 * но не считать» не годится: запрос к чужому серверу уже состоялся,
 * вместе с адресом страницы и заголовками браузера.
 */
const COUNTER_ID = 111569438;

export function YandexMetrika() {
  const choice = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (!isAccepted(choice)) return null;

  return (
    <Script id="ym-counter" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}','ym');
        ym(${COUNTER_ID},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",accurateTrackBounce:true,trackLinks:true});
      `}
    </Script>
  );
}

/**
 * Цель для рекламы.
 *
 * Без целей контекст крутится вслепую: система оптимизирует показы
 * по кликам, а не по заявкам, и деньги уходят на тех, кто кликает,
 * а не на тех, кто оставляет контакт.
 *
 * Вызов безопасен, когда счётчика нет: человек отказался от
 * аналитики, и функции ym в окне просто не существует.
 */
export function reachGoal(goal: string): void {
  const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
  if (typeof ym === "function") ym(COUNTER_ID, "reachGoal", goal);
}

/** Названия целей в одном месте: в интерфейсе Метрики они должны совпасть. */
export const GOALS = {
  /** Отправлена заявка с формы на лендинге. */
  leadSubmitted: "lead_submitted",
  /** Аудит пройден целиком: все 12 этапов оценены. */
  auditCompleted: "audit_completed",
  /** Отправлена заявка по итогам аудита. */
  auditLeadSubmitted: "audit_lead_submitted",
} as const;
