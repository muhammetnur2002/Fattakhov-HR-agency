/**
 * Подключение к локальному PostgreSQL: проверяет пароль, при
 * необходимости создаёт базу и вписывает строку подключения в .env.
 *
 *   node scripts/db-connect.mjs
 *
 * Пароль спрашивается на входе и не отображается — так он не попадёт
 * ни в историю PowerShell, ни в вывод команды. Спецсимволы (@ : / ? #)
 * кодируются автоматически: вписанные в URL руками, они ломают разбор
 * строки подключения, и Prisma сообщает про неверные учётные данные,
 * хотя пароль верный.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const HOST = process.env.PGHOST ?? 'localhost';
const PORT = process.env.PGPORT ?? '5432';
const USER = process.env.PGUSER ?? 'postgres';
const DB = process.env.PGDATABASE ?? 'fhr_students';

/** psql редко лежит в PATH на Windows — ищем в стандартных местах */
function findPsql() {
  const inPath = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (inPath.status === 0) return 'psql';
  for (const v of ['17', '16', '15', '14', '13']) {
    const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\psql.exe`;
    if (existsSync(p)) return p;
  }
  return null;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Гасим эхо, чтобы пароль не остался на экране
    const onData = (char) => {
      if (['\n', '\r', '\u0004'].includes(String(char))) return;
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(question);
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      process.stdin.off('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function psql(bin, password, database, sql) {
  return spawnSync(bin, ['-U', USER, '-h', HOST, '-p', PORT, '-d', database, '-tAc', sql], {
    encoding: 'utf8',
    // LC_MESSAGES=C — иначе psql отвечает на языке системы, и в консоли
    // Windows это приезжает нечитаемой кашей из-за смены кодовой страницы
    env: { ...process.env, PGPASSWORD: password, PGCLIENTENCODING: 'UTF8', LC_MESSAGES: 'C', LANG: 'C' },
  });
}

const psqlBin = findPsql();
if (!psqlBin) {
  console.error('Не нашёл psql. Укажите путь вручную или добавьте его в PATH.');
  process.exit(1);
}

const password = (await ask(`Пароль пользователя ${USER} на ${HOST}:${PORT}: `)).trim();
if (!password) {
  console.error('Пароль пустой — прерываю.');
  process.exit(1);
}

process.stdout.write('Проверяю подключение… ');
const probe = psql(psqlBin, password, 'postgres', 'SELECT 1');
if (probe.status !== 0) {
  console.log('не вышло.\n');
  const err = (probe.stderr || '').trim();
  // Текст про пароль присылает сам сервер, и он на языке его настроек:
  // в консоли Windows это нечитаемая каша. Поэтому разбираем не сообщение,
  // а факт — достучались ли мы до порта вообще.
  const serverDown = /Connection refused|could not connect to server/i.test(err)
    && !/authentication|password|paroli/i.test(err);

  if (serverDown) {
    console.error('Сервер не отвечает. Проверьте, запущена ли служба postgresql-x64-16.');
  } else {
    console.error('PostgreSQL отверг пароль — он задавался при установке сервера.');
    console.error('Если пароль утерян, его сбрасывают правкой pg_hba.conf с правами администратора.');
  }

  // Сырой вывод показываем, только если он читаем: иначе это мусор на экране
  if (err && /^[\x00-\x7F\s]*$/.test(err)) {
    console.error('\nОтвет psql:\n' + err);
  }
  process.exit(1);
}
console.log('пароль подходит.');

const exists = psql(psqlBin, password, 'postgres', `SELECT 1 FROM pg_database WHERE datname='${DB}'`);
if (!String(exists.stdout || '').trim()) {
  process.stdout.write(`Базы ${DB} нет, создаю… `);
  const created = psql(psqlBin, password, 'postgres', `CREATE DATABASE "${DB}"`);
  if (created.status !== 0) {
    console.log('не вышло.');
    console.error((created.stderr || '').trim());
    process.exit(1);
  }
  console.log('готово.');
} else {
  console.log(`База ${DB} уже есть.`);
}

// encodeURIComponent обязателен: @ в пароле обрывает userinfo, и хост
// начинает читаться с середины строки
const url = `postgresql://${USER}:${encodeURIComponent(password)}@${HOST}:${PORT}/${DB}?schema=public`;

const envPath = path.join(process.cwd(), '.env');
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const line = `DATABASE_URL="${url}"`;

if (/^\s*DATABASE_URL\s*=/m.test(env)) {
  env = env.replace(/^\s*DATABASE_URL\s*=.*$/m, line);
} else if (/^\s*#\s*DATABASE_URL\s*=/m.test(env)) {
  env = env.replace(/^\s*#\s*DATABASE_URL\s*=.*$/m, line);
} else {
  env += (env.endsWith('\n') ? '' : '\n') + line + '\n';
}
writeFileSync(envPath, env);

console.log('\nСтрока подключения записана в .env. Дальше:');
console.log('  npm run db:push');
console.log('  npm run db:seed');
console.log('  npm run dev');
