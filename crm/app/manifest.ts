import type { MetadataRoute } from "next";

/**
 * Манифест PWA — чтобы кабинет можно было поставить на экран телефона
 * иконкой, а не только открывать закладкой в браузере.
 *
 * Иконки временно те же, что у студенческой платформы (public/icons —
 * скопированы оттуда): свои фирменные под каждый размер и purpose
 * (maskable/monochrome) ещё не нарисованы. Заменить, когда будут готовы.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fattakhov HR Agency",
    short_name: "Fattakhov HR",
    description: "Кабинет клиента и рабочее место рекрутера",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eeeeea",
    theme_color: "#000000",
    icons: [
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
    ],
  };
}
