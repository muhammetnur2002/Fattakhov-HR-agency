import { getStore, isDemoMode } from '../lib/db';
import { generateAccessCode, hashToken } from '../lib/security/crypto';

/**
 * Выдать работодателю код доступа в кабинет.
 *
 *   npm run employer:code -- "Кофейни «Север»"
 *   npm run employer:code -- client-sever --label "Анна, управляющая" --days 90
 *
 * Регистрации у работодателя нет: аккаунт заводится синхронизацией с CRM,
 * а войти он может только по коду. Код печатается один раз — в базе лежит
 * лишь его хеш, восстановить исходную строку нельзя. Потерян — выпускайте
 * новый, старый при этом продолжит работать, пока не истечёт.
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const needle = positional[0];

  if (!needle) {
    console.error('Укажите работодателя: crmClientId или название компании.');
    console.error('  npm run employer:code -- "Кофейни «Север»"');
    process.exitCode = 1;
    return;
  }

  if (isDemoMode()) {
    console.error('Демо-режим: хранилище живёт в памяти, выданный код исчезнет вместе с процессом.');
    console.error('Подключите базу (npm run db:connect) и повторите.');
    process.exitCode = 1;
    return;
  }

  const store = await getStore();
  const employers = await store.employers.list();
  const match =
    employers.find((e) => e.crmClientId === needle) ??
    employers.find((e) => e.companyName.toLowerCase() === needle.toLowerCase()) ??
    employers.find((e) => e.companyName.toLowerCase().includes(needle.toLowerCase()));

  if (!match) {
    console.error(`Работодатель «${needle}» не найден. Известные компании:`);
    for (const e of employers) console.error(`  · ${e.companyName}${e.crmClientId ? ` (${e.crmClientId})` : ''}`);
    process.exitCode = 1;
    return;
  }

  const days = Number(arg('days') ?? 0);
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  const label = arg('label') ?? `Доступ для ${match.contactName}`;

  const code = generateAccessCode();
  await store.accessCodes.issue({
    accountId: match.accountId,
    codeHash: hashToken(code),
    label,
    expiresAt,
  });

  console.log(`\nКомпания:  ${match.companyName}`);
  console.log(`Контакт:   ${match.contactName}`);
  console.log(`Подпись:   ${label}`);
  console.log(`Действует: ${expiresAt ? `до ${expiresAt.toLocaleDateString('ru-RU')}` : 'бессрочно'}`);
  console.log(`\n  КОД: ${code}\n`);
  console.log('Передайте его контактному лицу. Второй раз он показан не будет —');
  console.log('в базе хранится только хеш.\n');
}

main()
  .catch((error) => {
    console.error('Не удалось выдать код:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Prisma держит пул открытым и не даёт процессу завершиться
    process.exit(process.exitCode ?? 0);
  });
