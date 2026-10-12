/**
 * Сторож: копирование в буфер — только через lib/clipboard.ts и CopyButton.
 *
 * Прямой `navigator.clipboard.writeText` без запасного пути молча ничего не
 * делает там, где Clipboard API нет (http, встроенные браузеры, старый
 * Safari): человек нажимает «Копировать» и не получает ни результата, ни
 * объяснения. Такой вызов был в пяти кнопках из шести.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCANNED = ["app", "components", "lib"];
const ALLOWED = new Set(["lib/clipboard.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "generated") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("копирование в буфер", () => {
  it("navigator.clipboard и execCommand('copy') только в lib/clipboard.ts", () => {
    const offenders: string[] = [];
    for (const full of SCANNED.flatMap((d) => walk(path.join(ROOT, d)))) {
      const file = path.relative(ROOT, full).split(path.sep).join("/");
      if (ALLOWED.has(file)) continue;
      const source = readFileSync(full, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/navigator\s*\.\s*clipboard/.test(source) || /execCommand\s*\(\s*["']copy["']/.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      "Копируй через <CopyButton> (components/shared/copy-button.tsx) или copyToClipboard() из lib/clipboard.ts",
    ).toEqual([]);
  });
});
