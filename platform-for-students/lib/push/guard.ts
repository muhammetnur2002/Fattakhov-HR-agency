import { createHash } from 'node:crypto';
import { lookup } from 'node:dns';
import { Agent } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Защита от запросов во внутреннюю сеть.
 *
 * Адрес подписки задаёт браузер, то есть по сути человек, а запрос по
 * нему отправляет наш сервер. Проверка при подписке
 * (lib/push/validation.ts) отсекает адреса-числа и внутренние имена, но
 * имя в интернете может вести куда угодно, в том числе во внутреннюю сеть
 * облака (метаданные машины, база). Поэтому адрес проверяется ещё раз при
 * соединении, уже разрешённый: в закрытые диапазоны сервер не ходит.
 *
 * Диапазоны 198.18.0.0/15 и 240.0.0.0/4 здесь намеренно не закрыты:
 * VPN-клиенты в режиме fake-ip отвечают на любое имя адресом оттуда,
 * и у разработчика с таким VPN пуши не уходили бы вовсе. На сервере
 * этих адресов нет ни у кого.
 */

const PRIVATE_RANGES = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // «этот» адрес
  ['10.0.0.0', 8], // внутренние сети (RFC 1918): в том числе подсеть облака
  ['100.64.0.0', 10], // общий адрес провайдера (CGNAT)
  ['127.0.0.0', 8], // сам сервер
  ['169.254.0.0', 16], // локальные, в том числе метаданные облака
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  // Адреса IPv4 внутри IPv6 (::ffff:10.0.0.1) BlockList сверяет с этими же правилами сам
  PRIVATE_RANGES.addSubnet(net, prefix, 'ipv4');
}
PRIVATE_RANGES.addAddress('::', 'ipv6');
PRIVATE_RANGES.addAddress('::1', 'ipv6');
PRIVATE_RANGES.addSubnet('fc00::', 7, 'ipv6'); // внутренние сети IPv6
PRIVATE_RANGES.addSubnet('fe80::', 10, 'ipv6'); // локальные IPv6

/** Можно ли серверу ходить на этот адрес. Не адрес вовсе — нельзя. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !PRIVATE_RANGES.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export const PRIVATE_ADDRESS_CODE = 'EPUSHPRIVATE';

/** Разрешение имени, которое не пускает во внутреннюю сеть. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, options, (error, address, family) => {
    if (error) return callback(error, address, family);
    const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (addresses.some((a) => !isPublicAddress(a))) {
      const refused: NodeJS.ErrnoException = new Error(
        `адрес службы уведомлений ведёт во внутреннюю сеть (${hostname})`,
      );
      refused.code = PRIVATE_ADDRESS_CODE;
      return callback(refused, address, family);
    }
    callback(null, address, family);
  });
};

/** Через него идут все запросы к службам уведомлений. */
export const pushAgent = new Agent({ lookup: guardedLookup });

/**
 * Отпечаток адреса подписки — по нему страница узнаёт «это устройство»,
 * не получая самих адресов: адрес подписки — то, по чему шлют, и в ответе
 * сервера ему делать нечего. Браузер считает тот же SHA-256
 * (lib/push/client.ts).
 */
export function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('base64url');
}

/** Имя службы уведомлений для человека: по ней понятно, чья беда. */
export function pushServiceName(endpoint: string): string {
  let host = '';
  try {
    host = new URL(endpoint).host;
  } catch {
    return 'адрес не разобрать';
  }
  if (host.endsWith('googleapis.com')) return 'Google';
  if (host.endsWith('push.apple.com')) return 'Apple';
  if (host.endsWith('mozilla.com')) return 'Mozilla';
  if (host.endsWith('notify.windows.com')) return 'Microsoft';
  return host;
}
