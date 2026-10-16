import { headers } from "next/headers";
import type { MetadataRoute } from "next";

import { SITE_NAME, SITE_PAGES } from "@/lib/marketing/seo";
import { isApplicationHost } from "@/lib/site-routing";
import { siteHost } from "@/lib/urls";

/**
 * Манифест PWA — чтобы кабинет можно было поставить на экран телефона
 * иконкой, а не только открывать закладкой в браузере.
 *
 * Тот же знак, что у студенческой платформы (public/icons — исходно
 * скопированы оттуда), но перекрашен: светлый фон и графитовая, а не
 * белая на чёрном, метка — своими базовыми цветами (--background и
 * --muted-foreground из app/globals.css). На телефоне рядом стоят
 * два значка с одинаковым кубом FHR, и раньше их было не различить —
 * теперь у CRM свой цвет плитки.
 *
 * Отвечает с обоих адресов, и содержимое у них разное: ссылка на манифест
 * стоит в корневом макете, то есть и на страницах сайта. С сайта файл раньше
 * уводило редиректом на другой домен, а браузер читает манифест как CORS-запрос и
 * на чужом домене без заголовков его не загружает (проверка сайта 11.10.2026).
 * Теперь он на месте. У сайта это манифест без режима приложения: ставить сайт
 * иконкой на экран незачем, кабинет живёт на своём адресе и там `standalone`.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host");
  const onSite = siteHost() !== null && !isApplicationHost(host);

  const icons: MetadataRoute.Manifest["icons"] = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-monochrome.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "monochrome",
    },
  ];

  if (onSite) {
    return {
      name: SITE_NAME,
      short_name: "Fattakhov HR",
      description: SITE_PAGES.home.description,
      start_url: "/",
      scope: "/",
      display: "browser",
      background_color: "#eeeeea",
      theme_color: "#000000",
      icons,
    };
  }

  return {
    name: "Fattakhov HR Agency",
    short_name: "Fattakhov HR",
    description: "Кабинет клиента и рабочее место рекрутера",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eeeeea",
    theme_color: "#000000",
    icons,
  };
}
