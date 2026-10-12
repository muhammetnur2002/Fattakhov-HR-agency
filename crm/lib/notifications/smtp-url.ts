/**
 * Адрес почтового сервера с обязательным шифрованием.
 *
 * Порт 587 по умолчанию шифруется «по возможности» (STARTTLS): перехватчик
 * в сети может вырезать предложение шифрования, и сервер молча переходит
 * на открытый обмен — логин и пароль почты утекают. Параметр requireTLS
 * запрещает такой откат: нет шифрования — письмо не уходит.
 *
 * smtps:// шифрован с первого байта и в правке не нуждается. Локальные
 * адреса (разработка, ловушка писем) шифрования не имеют и не должны его
 * требовать. Явный requireTLS / ignoreTLS в адресе владелец ставит сам:
 * его слово весомее нашего умолчания.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function secureSmtpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Не адрес (например, имя сервиса) — отдаём как есть, nodemailer разберётся сам
    return raw;
  }
  if (url.protocol !== "smtp:") return raw;
  if (LOCAL_HOSTS.has(url.hostname.toLowerCase())) return raw;
  if (url.searchParams.has("requireTLS") || url.searchParams.has("ignoreTLS")) return raw;
  url.searchParams.set("requireTLS", "true");
  return url.toString();
}
