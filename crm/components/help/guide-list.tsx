import type { GuideItem } from "@/lib/help/guide";

/**
 * Список «вопрос — ответ» со сворачиванием.
 *
 * Штатный `details`, а не своя механика на состоянии: раскрытие работает
 * до загрузки JS и без него, а поиск по странице браузером находит текст
 * внутри свёрнутых пунктов. Для справки это важнее анимации — человек
 * приходит сюда с конкретным вопросом и часто ищет словом.
 *
 * Разметка повторяет вопросы на сайте (components/marketing/sections.tsx):
 * плюс превращается в минус поворотом одной полоски, отдельной иконки
 * нет. Кегли здесь меньше — кабинет плотнее лендинга.
 */
export function GuideList({ items }: { items: GuideItem[] }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => (
        <details
          key={item.question}
          className="group [&_summary::-webkit-details-marker]:hidden"
        >
          {/* Отступы — у summary, а не у details: тогда нажимается вся
              полоса вопроса, а не только строка текста посередине
              (24px из 52 на телефоне) */}
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
            {item.question}
            <span
              aria-hidden
              className="relative size-3.5 shrink-0 text-muted-foreground before:absolute before:top-1/2 before:left-0 before:h-[1.5px] before:w-3.5 before:-translate-y-1/2 before:bg-current after:absolute after:top-1/2 after:left-0 after:h-[1.5px] after:w-3.5 after:-translate-y-1/2 after:rotate-90 after:bg-current after:transition-transform group-open:after:rotate-0"
            />
          </summary>

          <div className="-mt-1 max-w-3xl space-y-2.5 px-4 pb-3.5 text-sm leading-relaxed text-muted-foreground">
            {item.answer.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
