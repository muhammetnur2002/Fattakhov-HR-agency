import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Словарь распространённых паролей.
 *
 * Основа — «10k-most-common» из SecLists (лицензия MIT, текст — в
 * common-passwords.LICENSE рядом): десять тысяч паролей, которыми
 * перебирают в первую очередь. Дополнение ниже — то, чего в английском
 * списке нет: русские слова и русские раскладки, которыми люди
 * подменяют «password» и «qwerty».
 *
 * Читается с диска один раз за процесс и держится в Set: проверка
 * пароля — поиск по хешу, а не по списку из тысяч строк на каждый запрос.
 */

const FILE = path.join(process.cwd(), "lib", "auth", "common-passwords.txt");

/**
 * Запасной минимум на случай, если файла рядом с процессом нет (образ
 * собран без него). Проверка слабее, но не пропадает: молча принимать
 * всё подряд хуже, чем принимать меньше. Сбой при этом виден в журнале.
 */
const FALLBACK = [
  "password",
  "123456789",
  "qwerty123",
  "iloveyou",
  "1q2w3e4r5t",
  "qwertyuiop",
  "administrator",
  "welcome1",
  "letmein",
  "monkey",
  "dragon",
];

/** Русские слова и привычные подмены: «пароль», «привет», «qwerty» русской раскладкой. */
const EXTRA = [
  "пароль",
  "пароль123",
  "пароль1234",
  "парольпароль",
  "привет",
  "привет123",
  "приветмир",
  "любовь",
  "люблютебя",
  "россия",
  "москва",
  "казань",
  "татарстан",
  "администратор",
  "админ",
  "секрет",
  "йцукен",
  "йцукен123",
  "йцукенгшщз",
  "фывапролд",
  "ячсмить",
  "1q2w3e4r",
  "1q2w3e4r5t6y",
  "1qaz2wsx",
  "1qaz2wsx3edc",
  "qazwsxedc",
  "zaq12wsx",
  "zaq1xsw2",
  "123qweasd",
  "123qweasdzxc",
  "qweasdzxc",
  "q1w2e3r4t5",
  "qwerty12345",
  "qwerty123456",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "poiuytrewq",
  "mnbvcxz",
  "password123",
  "password1234",
  "password12345",
  "parol123",
  "parol1234",
  "parol12345",
  "parolparol",
  "fattakhov",
  "fattakhovhr",
  "fhrfhrfhr",
  "crmcrmcrm",
  "welcome123",
  "admin123",
  "admin1234",
  "administrator1",
  "changeme",
  "changeme123",
  "letmein123",
  "iloveyou123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "pa$$word",
  "master123",
  "secret123",
  "default",
  "temp1234",
  "test1234",
  "testtest",
  "demo1234",
  "demodemo",
];

let cached: Set<string> | null = null;

function words(): Set<string> {
  if (cached) return cached;

  const set = new Set<string>();
  try {
    for (const line of readFileSync(FILE, "utf8").split("\n")) {
      const word = line.trim().toLowerCase();
      if (word) set.add(word);
    }
  } catch (error) {
    console.error(
      `[пароли] словарь ${FILE} не прочитан, действует урезанный список`,
      error,
    );
    FALLBACK.forEach((w) => set.add(w));
  }
  EXTRA.forEach((w) => set.add(w));

  cached = set;
  return set;
}

/** Есть ли пароль в словаре. Регистр и пробелы по краям не важны. */
export function isCommonPassword(password: string): boolean {
  return words().has(password.trim().toLowerCase());
}

/** Сколько записей в словаре (для теста: файл должен быть прочитан целиком). */
export function commonPasswordCount(): number {
  return words().size;
}
