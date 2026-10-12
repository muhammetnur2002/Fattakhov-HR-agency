#!/usr/bin/env node
/**
 * Проверка продовых зависимостей на известные уязвимости.
 *
 *   node scripts/audit-gate.mjs crm
 *   node scripts/audit-gate.mjs platform-for-students
 *   node scripts/audit-gate.mjs --self-test
 *
 * Падает, если у продовых зависимостей есть уязвимость уровня high или
 * critical, которой нет в scripts/audit-allowlist.json. Простой
 * `npm audit` для этого не годится: в кабинете остаётся цепочка Prisma CLI
 * (mysql2, deepmerge-ts), чьё «исправление» — понижение Prisma на
 * мажорную версию. Она до сети не доходит (MySQL не используется), поэтому
 * внесена в список с причиной, а всё новое по-прежнему краснит проверку.
 *
 * Каждая запись списка — пакет и причина. Запись без причины игнорируется:
 * молча «заглушить» находку нельзя.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const BLOCKING = new Set(["high", "critical"]);

/** Какие уязвимости блокируют: серьёзные и не внесённые в список с причиной. */
export function blockingFindings(vulnerabilities, allowed = {}) {
  return Object.entries(vulnerabilities ?? {})
    .filter(([name, v]) => BLOCKING.has(v.severity))
    .filter(([name]) => !(typeof allowed[name] === "string" && allowed[name].trim().length > 0))
    .map(([name, v]) => ({ name, severity: v.severity }));
}

function selfTest() {
  const found = {
    sharp: { severity: "high" },
    prisma: { severity: "high" },
    tiny: { severity: "low" },
    nope: { severity: "critical" },
  };
  assert.deepEqual(
    blockingFindings(found, { prisma: "цепочка CLI, до сети не доходит" }).map((f) => f.name),
    ["sharp", "nope"],
  );
  // запись без причины ничего не заглушает
  assert.deepEqual(
    blockingFindings({ prisma: { severity: "high" } }, { prisma: "" }).map((f) => f.name),
    ["prisma"],
  );
  assert.deepEqual(blockingFindings({}, {}), []);
  assert.deepEqual(blockingFindings(undefined, {}), []);
  console.log("audit-gate: самопроверка пройдена");
}

function main() {
  const target = process.argv[2];
  if (target === "--self-test") return selfTest();
  if (!target) {
    console.error("Укажите каталог приложения: crm или platform-for-students");
    process.exit(2);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const allowlist = JSON.parse(readFileSync(join(here, "audit-allowlist.json"), "utf8"));
  const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: join(here, "..", target),
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 32 * 1024 * 1024,
  });

  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    // Нет ответа от реестра — не «чисто»: проверка, которая молчит, хуже её отсутствия
    console.error(`npm audit не вернул отчёт для ${target}:\n${run.stderr || run.stdout}`);
    process.exit(2);
  }

  const bad = blockingFindings(report.vulnerabilities, allowlist[target] ?? {});
  if (bad.length) {
    console.error(`${target}: непринятые уязвимости продовых зависимостей:`);
    for (const f of bad) console.error(`  - ${f.name} (${f.severity})`);
    console.error("Обновите пакет (npm audit fix) или внесите в scripts/audit-allowlist.json с причиной.");
    process.exit(1);
  }
  console.log(`${target}: новых серьёзных уязвимостей нет`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
