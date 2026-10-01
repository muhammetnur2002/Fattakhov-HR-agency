'use client';

import Script from 'next/script';
import { useSyncExternalStore } from 'react';
import { getServerSnapshot, getSnapshot, isAccepted, subscribe } from '@/lib/analytics/consent';

/**
 * Яндекс.Метрика.
 *
 * Номер счётчика вшивается в код при сборке (NEXT_PUBLIC_*), поэтому в образе он
 * передаётся параметром сборки, см. Dockerfile. Пусто — счётчик не подключается.
 *
 * Подключается только на публичных страницах (см. AnalyticsGate) и только после
 * явного согласия: в кабинетах, при регистрации и входе человек вводит
 * персональные данные, туда сторонний сервис не пускаем. Запись сессий
 * (Вебвизор) выключена: аудитория — студенты, и записывать их действия незачем.
 */
const COUNTER_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();

export function YandexMetrika() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!COUNTER_ID || !/^\d+$/.test(COUNTER_ID) || !isAccepted(choice)) return null;

  return (
    <Script id="ym-counter" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}','ym');
        ym(${COUNTER_ID},'init',{ssr:true,webvisor:false,clickmap:true,referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
      `}
    </Script>
  );
}

/**
 * Цель для отчётов. Безопасно вызывать, когда счётчика нет или человек отказался:
 * функции ym в окне тогда просто не существует.
 */
export function reachGoal(goal: string): void {
  if (!COUNTER_ID) return;
  const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
  if (typeof ym === 'function') ym(Number(COUNTER_ID), 'reachGoal', goal);
}

/** Названия целей в одном месте: в интерфейсе Метрики идентификаторы должны совпасть. */
export const GOALS = {
  /** Нажато «Я студент» на главной. */
  ctaStudent: 'cta_student',
  /** Нажато «Я работодатель» на главной. */
  ctaEmployer: 'cta_employer',
} as const;
