import { SiteNotFound } from "@/components/marketing/site-not-found";

/**
 * Страница «не найдено» сайта. Код 404 ей даёт прокси (proxy.ts, lib/site-routing.ts), не сама страница:
 * `notFound()` здесь нельзя — тело ответа осталось бы пустым каркасом, а корневой `app/not-found.tsx`
 * с проверкой адреса сделал бы динамическими все страницы сайта. Подробности — у `SITE_NOT_FOUND_PATH`.
 */
export default function SiteNotFoundPage() {
  return <SiteNotFound />;
}
