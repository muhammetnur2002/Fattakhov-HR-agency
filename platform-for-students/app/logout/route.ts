import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/security/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Аварийный выход по ссылке.
 *
 * Обычный выход — POST /api/auth/logout из интерфейса. Этот нужен там,
 * где куку должен снять сервер прямо во время навигации: серверный
 * компонент менять куки не умеет, а оставить человека с сессией, которая
 * ссылается на несуществующий аккаунт, — значит запереть его между
 * /feed и /login. Так бывает после пересоздания базы: подпись у токена
 * ещё верна, а строки, на которую он указывает, уже нет.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL('/login', incoming.origin);

  const reason = incoming.searchParams.get('reason');
  if (reason) target.searchParams.set('reason', reason);
  const next = incoming.searchParams.get('next');
  if (next && next.startsWith('/')) target.searchParams.set('next', next);

  // Куку снимаем на ответе, а не через cookies(): так она уходит именно
  // с этим редиректом и не зависит от порядка выполнения
  const response = NextResponse.redirect(target);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
