/**
 * Граница поддержки браузеров и скрипт, который её проверяет.
 *
 * Сборка рассчитана на Safari 16.4, Chrome и Edge 111, Firefox 113 и новее
 * (так же, как Next.js и Tailwind 4). Safari ниже 16.4 не разбирает код
 * страницы целиком: регулярные выражения с просмотром назад там вызывают
 * синтаксическую ошибку, пакет скриптов не выполняется, и человек видит
 * страницу без единой работающей кнопки и без объяснения почему.
 *
 * Проверка идёт по возможностям, а не по строке User-Agent: строка врёт
 * (режим «версия для компьютера» в iPad, встроенные окна, расширения), а
 * возможность либо есть, либо нет. Скрипт — обычный ES5 и вписан прямо в
 * разметку (как анти-мерцающий скрипт темы): он обязан выполниться и там,
 * где основной пакет не запустился. Внешних скриптов нет.
 *
 * Плашка со всеми возможными причинами рисуется сервером скрытой, а скрипт
 * лишь снимает `hidden` с нужных кусков. Вставлять в неё текст или узлы нельзя:
 * React при гидратации находит лишний узел и пересобирает всё дерево заново
 * (проверено в браузере), а смена атрибута его не волнует.
 */

/** Что проверяется и как это названо для человека. Порядок — порядок в плашке. */
export const BROWSER_REQUIREMENTS = [
  {
    id: "js",
    title: "современный JavaScript (регулярные выражения с просмотром назад — Safari 16.4 и новее)",
  },
  { id: "css", title: "современные цвета CSS (color-mix)" },
  { id: "clone", title: "структурное копирование данных (structuredClone)" },
] as const;

/** Минимальные версии — в тексте плашки. */
export const MIN_BROWSERS_TEXT = "Safari 16.4, Chrome и Edge 111, Firefox 113";

/**
 * Тело функции с параметрами `w` (window) и `d` (document). Отдельным текстом,
 * чтобы тест мог выполнить тот же код на подменённом окне.
 */
export const BROWSER_SUPPORT_BODY = `
var missing = [];
try { new w.RegExp("(?<=a)b"); } catch (e) { missing.push("js"); }
try {
  if (!(w.CSS && typeof w.CSS.supports === "function" && w.CSS.supports("color", "color-mix(in srgb, red, blue)"))) missing.push("css");
} catch (e) { missing.push("css"); }
if (typeof w.structuredClone !== "function") missing.push("clone");
if (!missing.length) return;

var box = d.getElementById("browser-notice");
if (!box) return;
try { if (w.sessionStorage.getItem("browser-notice-closed") === "1") return; } catch (e) {}

// Причины уже есть в разметке (скрытые) — открываем нужные. Текст в элемент
// React не вставляем: лишний узел при гидратации — ошибка «server rendered HTML
// didn't match», а смена атрибута hidden — нет.
for (var i = 0; i < missing.length; i++) {
  var item = d.querySelector('[data-missing="' + missing[i] + '"]');
  if (item) item.removeAttribute("hidden");
}

box.removeAttribute("hidden");
var close = d.getElementById("browser-notice-close");
if (close) close.onclick = function () {
  box.setAttribute("hidden", "");
  try { w.sessionStorage.setItem("browser-notice-closed", "1"); } catch (e) {}
};
`;

/** Скрипт для вписывания в разметку: вызывается сразу, до загрузки пакета. */
export const BROWSER_SUPPORT_SCRIPT = `(function(w,d){try{${BROWSER_SUPPORT_BODY}}catch(e){}})(window,document);`;
