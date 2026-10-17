/**
 * Где работает нижняя панель разделов: iOS или нет, открыт ли кабинет как приложение
 * с экрана «Домой». Только вопросы к браузеру, без состояния.
 *
 * iOS определяется возможностью, а не User-Agent: `-webkit-touch-callout` понимает WebKit
 * на iPhone и iPad (в том числе Chrome и Firefox на iOS, у них тот же движок) и не понимает
 * ни один другой. Тем же условием в стилях — `@supports (-webkit-touch-callout: none)`
 * в app/globals.css, и оба места обязаны совпадать: CSS отключает переход панели,
 * хук освежает её слой.
 */

/** WebKit на iPhone или iPad (Safari, приложение с экрана «Домой», Chrome на iOS). */
export function isIosWebKit(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("-webkit-touch-callout", "none");
  } catch {
    return false;
  }
}

/** Кабинет открыт как приложение с экрана «Домой» (манифест `display: standalone`). */
export function isStandaloneApp(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    // Safari на iPhone до появления display-mode отдавал признак отдельным полем
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
