'use client';

/**
 * Сбой самого корневого каркаса: заменяет весь документ, поэтому стили приложения здесь не загружены.
 * Оформление встроенное, текст русский, кнопка «Повторить» и ссылка на главную.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#070707',
          color: '#f8f8f8',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 12px' }}>Что-то пошло не так</h1>
          <p style={{ margin: '0 0 24px', color: 'rgba(248,248,248,0.7)', lineHeight: 1.5 }}>
            Страница не открылась. Попробуйте ещё раз; если повторится, напишите нам.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '12px 22px', borderRadius: 12, border: 0, background: '#f8f8f8', color: '#070707', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
          >
            Повторить
          </button>{' '}
          {/* Обычная ссылка: роутера Next здесь нет, документ заменён целиком */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginLeft: 8, color: 'rgba(248,248,248,0.7)', fontSize: 15 }}>
            На главную
          </a>
        </main>
      </body>
    </html>
  );
}
