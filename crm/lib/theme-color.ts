/**
 * Цвет полосы браузера (meta theme-color) — тот же, что у страницы.
 *
 * Next.js рисует два тега с `media="(prefers-color-scheme: …)"`: полоса
 * следует за темой СИСТЕМЫ. Переключатель темы в интерфейсе её не знает:
 * человек с тёмным телефоном выбирает «светлую», страница становится
 * светлой, а полоса адреса остаётся чёрной (и наоборот).
 *
 * При ручном выборе скрипт ниже ставит ПЕРВЫМ в <head> свой тег без media —
 * браузер берёт первый подходящий тег, и он перебивает оба системных. При
 * «как в системе» тег убирается, и полосой снова правит система. Теги Next
 * не трогаются: React при гидратации узнаёт свои теги по содержимому, и
 * правка `content` до гидратации плодила дубли (проверено — третий тег в
 * <head>). Свой тег React не знает и не удаляет, переходы между кабинетами
 * его не пересоздают.
 *
 * Скрипт вписан в разметку (как и скрипт темы в app/layout.tsx), чтобы
 * сработать до первой отрисовки, и выставляет `window.__applyThemeColor`
 * для ThemeProvider: логика живёт в одном месте.
 */

/** Цвета страницы. Обязаны совпадать с `--background` в globals.css — это проверяет тест. */
export const THEME_COLORS = { light: "#eeedea", dark: "#000000" } as const;

export type ThemeChoice = "light" | "dark" | "system";

/** Идентификатор тега-перебивки. */
export const THEME_COLOR_OVERRIDE_ID = "theme-color-override";

/** ES5 в одну функцию: выполняется до пакета и там, где пакет не запустился. */
export const THEME_COLOR_SCRIPT = `(function(w,d){
var COLORS=${JSON.stringify(THEME_COLORS)};
function apply(mode){
  var el=d.getElementById("${THEME_COLOR_OVERRIDE_ID}");
  if(mode!=="light"&&mode!=="dark"){
    if(el&&el.parentNode)el.parentNode.removeChild(el);
    return;
  }
  if(!el){
    el=d.createElement("meta");
    el.id="${THEME_COLOR_OVERRIDE_ID}";
    el.name="theme-color";
  }
  if(el.getAttribute("content")!==COLORS[mode])el.setAttribute("content",COLORS[mode]);
  var head=d.head;
  if(head&&head.firstChild!==el)head.insertBefore(el,head.firstChild);
}
w.__applyThemeColor=apply;
})(window,document);`;

declare global {
  interface Window {
    /** Выставляется встроенным скриптом из lib/theme-color.ts. */
    __applyThemeColor?: (mode: ThemeChoice) => void;
  }
}
