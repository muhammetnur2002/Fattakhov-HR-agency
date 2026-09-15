"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Отказ на самом верхнем уровне: упала корневая разметка.
 *
 * Отличается от app/error.tsx тем, что заменяет собой весь документ,
 * включая html и body, — потому что упало как раз то, что их рисует.
 * Вместе с разметкой не применился и globals.css, поэтому оформление
 * здесь записано прямо в атрибутах: классы Tailwind тут не на что
 * опереть. Тем же приёмом сделана страница отказа в /api/files.
 *
 * Сюда попадают редко: обычную ошибку страницы перехватывает
 * app/error.tsx, оставляя человеку меню и оформление продукта.
 * Но если этот файл не завести, на месте корневого сбоя окажется
 * английская страница Next, и выглядеть это будет так, будто домен
 * не наш.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#323537",
          color: "#f3f4f5",
          font: '15px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>
            Платформа не отвечает
          </h1>
          <p style={{ margin: "0 0 16px", color: "#b8bcc0" }}>
            Мы уже видим эту ошибку в своих логах. Попробуйте обновить
            страницу через минуту.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 12,
                color: "#8f9499",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              font: "inherit",
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #4a4e51",
              background: "#f3f4f5",
              color: "#323537",
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
