import type { MetadataRoute } from "next";

/**
 * Манифест PWA — чтобы кабинет можно было поставить на экран телефона
 * иконкой, а не только открывать закладкой в браузере.
 *
 * Иконка собрана из фирменного знака на графите (`--brand-graphite`
 * из globals.css), а не сделана заново: тот же цвет, что в сайдбаре.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fattakhov HR Agency",
    short_name: "Fattakhov HR",
    description: "Кабинет клиента и рабочее место рекрутера",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#323537",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
