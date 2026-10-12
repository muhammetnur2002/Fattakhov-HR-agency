import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Каркас страницы настроек агентства: именованные разделы вместо одной ленты из десяти
 * одинаковых карточек.
 *
 * Страница шла сплошной колонкой в 4500px без единого заголовка выше карточки: «Пароль», «Сессии»,
 * «Договор для клиентов» и «Журнал входов» стояли вровень, и нужное приходилось искать прокруткой.
 * Теперь вверху якорная навигация (`SettingsNav`), ниже разделы с заголовком `h2` и коротким
 * пояснением (`SettingsSection`), а заголовок самой карточки — `h3`.
 *
 * Каркас ничего не знает о правах: какие разделы и карточки показать, решает страница через
 * `canDo` (lib/access), сюда приходит уже готовый набор.
 */

export type SettingsSectionMeta = {
  id: string;
  /** Заголовок раздела. */
  title: string;
  /** Короткая подпись для кнопки навигации — в одну строку на телефоне. */
  short: string;
  description: string;
};

/** Якорные кнопки наверху страницы: на телефоне переносятся в две строки, а не скроллятся вбок. */
export function SettingsNav({ sections }: { sections: Pick<SettingsSectionMeta, "id" | "short">[] }) {
  return (
    <nav aria-label="Разделы настроек" className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <Button key={section.id} asChild variant="outline" size="sm">
          <a href={`#${section.id}`}>{section.short}</a>
        </Button>
      ))}
    </nav>
  );
}

/**
 * Раздел настроек: заголовок `h2`, пояснение и карточки. Отделён от предыдущего линией —
 * границу между «Безопасностью» и «Уведомлениями» видно, не читая заголовков.
 */
export function SettingsSection({
  meta,
  children,
}: {
  meta: Pick<SettingsSectionMeta, "id" | "title" | "description">;
  children: React.ReactNode;
}) {
  const titleId = `${meta.id}-title`;
  return (
    <section id={meta.id} aria-labelledby={titleId} className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        <h2 id={titleId} className="text-lg font-medium">
          {meta.title}
        </h2>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Карточка-переход на отдельную страницу (сотрудники, журнал входов, персональные данные):
 * заголовок и пояснение слева, «Открыть» справа в той же строке. Раньше кнопка стояла отдельным
 * блоком под текстом, и каждая такая карточка была на 60px выше, чем нужно.
 */
export function SettingsLinkCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3" className="text-base">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={href} aria-label={`${title}: открыть`}>
              Открыть
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
