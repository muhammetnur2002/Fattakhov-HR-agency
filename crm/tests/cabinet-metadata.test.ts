/**
 * Установка кабинета на экран «Домой» (lib/cabinet-metadata.ts).
 *
 * Что можно проверить без iPhone: метаданные подключены ко всем макетам,
 * откуда человек нажимает «На экран „Домой“», а значок не прозрачный —
 * прозрачное iOS заливает чёрным. Как значок выглядит на устройстве,
 * подтверждает только человек.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { CABINET_METADATA } from "@/lib/cabinet-metadata";

const ROOT = path.join(__dirname, "..");

describe("экран «Домой»", () => {
  it("название под значком, обычная строка состояния, цифры без автоссылок", () => {
    expect(CABINET_METADATA.appleWebApp).toMatchObject({
      title: "Fattakhov HR",
      statusBarStyle: "default",
    });
    expect(CABINET_METADATA.formatDetection).toMatchObject({ telephone: false });
  });

  it.each([
    "app/(client)/layout.tsx",
    "app/(agency)/a/layout.tsx",
    "app/(public)/layout.tsx",
    "app/(onboarding)/layout.tsx",
  ])("%s отдаёт метаданные кабинета", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    expect(source).toContain("export const metadata = CABINET_METADATA");
  });

  it("значок 180×180 и без прозрачности", () => {
    const icon = pngInfo(readFileSync(path.join(ROOT, "app", "apple-icon.png")));
    expect([icon.width, icon.height]).toEqual([180, 180]);
    expect(icon.minAlpha).toBe(255);
  });
});

/**
 * Размер и наименьшая непрозрачность PNG — без сторонних пакетов.
 * RGB без альфа-канала непрозрачен по определению; другие форматы тест
 * не разбирает и падает, чтобы новый значок посмотрел человек.
 */
function pngInfo(png: Buffer): { width: number; height: number; minAlpha: number } {
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    }
    if (type === "IDAT") idat.push(body);
    pos += 12 + length;
  }
  if (colorType === 2) return { width, height, minAlpha: 255 };
  if (colorType !== 6 || depth !== 8 || interlace !== 0) {
    throw new Error(`значок в непривычном формате PNG (тип ${colorType}) — проверьте его глазами`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  let prev = new Uint8Array(stride);
  let minAlpha = 255;
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1);
    const filter = raw[offset];
    const line = new Uint8Array(raw.subarray(offset + 1, offset + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 3; x < stride; x += bpp) minAlpha = Math.min(minAlpha, line[x]);
    prev = line;
  }
  return { width, height, minAlpha };
}
