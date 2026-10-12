import { BROWSER_REQUIREMENTS, BROWSER_SUPPORT_SCRIPT, MIN_BROWSERS_TEXT } from "@/lib/browser-support";

/**
 * Плашка «Обновите браузер» для браузеров, которых сборка не поддерживает.
 *
 * Серверный компонент без состояния: разметка скрыта (`hidden`) вместе со
 * всеми возможными причинами, а нужные части открывает скрипт из
 * lib/browser-support.ts — проверка по возможностям браузера, не по
 * User-Agent. Скрипт вписан в разметку, потому что в старом Safari
 * основной пакет не запускается вовсе, и объяснить человеку, почему ничего
 * не работает, больше некому.
 *
 * Оформление — атрибутом style, а не классами Tailwind: в браузере, которому
 * не хватает современного CSS, классы как раз и не сработают. Цвета заданы
 * оба сразу (фон и текст), чтобы читаться на любой теме страницы. Тон
 * спокойный: это подсказка, а не ошибка, закрывается кнопкой.
 */
export function UnsupportedBrowserNotice() {
  return (
    <>
      <div
        id="browser-notice"
        role="region"
        aria-label="Устаревший браузер"
        hidden
        // Содержимое меняет скрипт ещё до гидратации; сравнивать нечего
        suppressHydrationWarning
        style={{
          background: "#fff4d6",
          color: "#3b2f00",
          borderBottom: "1px solid #e6d3a0",
          padding: "10px 16px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "14px",
          lineHeight: "1.45",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
          <div style={{ flex: "1 1 18rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Обновите браузер.</strong> Он не поддерживает то, на чём работает эта страница, поэтому
              кнопки, формы и разделы могут не открываться. Не хватает:
            </p>
            <ul style={{ margin: "4px 0", paddingLeft: "20px", listStyle: "disc" }}>
              {BROWSER_REQUIREMENTS.map((r) => (
                <li key={r.id} data-missing={r.id} hidden suppressHydrationWarning>
                  {r.title}
                </li>
              ))}
            </ul>
            <p style={{ margin: 0 }}>
              Подойдёт {MIN_BROWSERS_TEXT} или новее — можно открыть сайт в другом браузере.
            </p>
          </div>
          <button
            id="browser-notice-close"
            type="button"
            style={{
              border: "1px solid #b89b45",
              background: "transparent",
              color: "inherit",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Понятно
          </button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: BROWSER_SUPPORT_SCRIPT }} />
    </>
  );
}
