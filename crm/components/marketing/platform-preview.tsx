import { Check, Clock, MessageSquare } from "lucide-react";

import { Reveal } from "@/components/motion/primitives";

/**
 * Личный кабинет на лендинге.
 *
 * Главное отличие от «агентства, которое присылает резюме в почту»,
 * до сих пор жило на сайте одной строчкой в списке. Показываем сам
 * интерфейс: это единственное, что конкуренты в городе не могут
 * повторить текстом.
 *
 * Это не скриншот, а верстка в стиле кабинета — и намеренно:
 *
 *   1. На публичной странице не должно быть ничего, похожего на
 *      данные живых людей. Даже выдуманные имя, телефон и зарплата
 *      на витрине оператора ПДн читаются как утечка.
 *   2. Скриншот устаревает на первой же правке интерфейса, а этот
 *      блок собран из тех же классов и меняется вместе с темой.
 *   3. Картинка не тянется под узкий экран, а разметка тянется.
 */

const STAGES = [
  {
    name: "Представлен клиенту",
    count: 3,
    cards: [
      { role: "Руководитель отдела продаж", salary: "210 000 ₽", days: "2 дн.", comments: 2 },
      { role: "Коммерческий директор", salary: "245 000 ₽", days: "1 дн.", comments: null },
    ],
  },
  {
    name: "Интервью с клиентом",
    count: 2,
    cards: [
      { role: "Начальник отдела продаж", salary: "205 000 ₽", days: "4 дн.", comments: 1 },
    ],
  },
  {
    name: "Оффер",
    count: 1,
    cards: [
      { role: "Системный аналитик", salary: "230 000 ₽", days: "1 дн.", comments: null },
    ],
  },
];

const ABILITIES = [
  "Видеть каждого кандидата и то, на каком он этапе",
  "Решать прямо в карточке: позвать на интервью, взять паузу, отказать",
  "Сравнивать кандидатов между собой, а не держать их в голове",
  "Обсуждать кандидата с рекрутером там же, где он лежит",
  "Видеть сроки и просрочки раньше, чем они станут проблемой",
];

export function PlatformPreview() {
  return (
    <Reveal className="mt-12">
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        {/* Подложка светлая: на графите секции она читается как окно
            приложения, а не как ещё один блок текста */}
        <div className="rounded-2xl bg-background p-4 shadow-2xl ring-1 ring-white/10 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-base font-medium text-foreground">
              №1 Руководитель отдела продаж
            </div>
            <div className="text-sm text-muted-foreground">6 кандидатов</div>
          </div>

          {/* Все три этапа видны на любом экране — макет иллюстрирует
              кабинет, и версия для телефона не должна показывать урезанную
              картину. На узком экране третий этап просто занимает вторую
              строку целиком, а не пропадает */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STAGES.map((stage, i) => (
              <div
                key={stage.name}
                className={`flex flex-col rounded-lg border bg-muted/30 p-2 ${
                  i === 2 ? "col-span-2 sm:col-span-1" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 px-0.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {stage.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground">
                    {stage.count}
                  </span>
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  {stage.cards.map((card) => (
                    <div
                      key={card.role}
                      className="rounded-md border bg-background p-2"
                    >
                      {/* Вместо имени — планка: на публичной странице
                          показывать имена кандидатов, даже выдуманные,
                          нам не следует */}
                      <div className="h-2 w-16 rounded-full bg-foreground/25" />
                      <div className="mt-1.5 truncate text-xs text-muted-foreground">
                        {card.role}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">{card.salary}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {card.days}
                        </span>
                        {card.comments !== null && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {card.comments}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Так выглядит воронка в вашем кабинете. Имена кандидатов здесь
            скрыты — на сайте им не место.
          </p>
        </div>

        <div>
          <ul className="space-y-3">
            {ABILITIES.map((item) => (
              <li key={item} className="flex gap-3 text-base leading-relaxed text-white/80">
                <Check className="mt-0.5 size-4 shrink-0 text-white" />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-base leading-relaxed text-white/60">
            Доступ в кабинет входит в любой тариф. Отдельно за него
            не платят.
          </p>
        </div>
      </div>
    </Reveal>
  );
}
