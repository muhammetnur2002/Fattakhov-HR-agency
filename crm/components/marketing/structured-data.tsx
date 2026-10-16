import { jsonLdFor } from "@/lib/marketing/json-ld";
import type { SitePageKey } from "@/lib/marketing/seo";

/**
 * JSON.stringify не экранирует "<" — а строка `</script>` внутри значения
 * оборвала бы тег раньше срока. Сейчас все поля — собственные константы,
 * поэтому это чисто защита на будущее: как только сюда попадёт что-то
 * не из наших же констант, экранирование уже стоит.
 */
export function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Микроразметка страницы для поисковиков.
 *
 * Даёт расширенный сниппет: название организации, цены, ответы на вопросы,
 * путь до страницы. Какие узлы стоят на какой странице и откуда берутся данные —
 * в `lib/marketing/json-ld.ts`; здесь только вывод. Страница без разметки
 * (политика) ничего не рисует.
 */
export function StructuredData({ page }: { page: SitePageKey }) {
  const nodes = jsonLdFor(page);
  if (nodes.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdSafe({ "@context": "https://schema.org", "@graph": nodes }),
      }}
    />
  );
}
