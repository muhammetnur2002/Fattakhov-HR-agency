import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '@/lib/security/guards';

/** Единый конверт ответа: клиент всегда знает, где искать ошибку. */
export interface ApiError {
  error: string;
  code?: string;
  fields?: Record<string, string>;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(status: number, error: string, code?: string, fields?: Record<string, string>) {
  return NextResponse.json<ApiError>({ error, code, fields }, { status });
}

/**
 * Обёртка над обработчиком роута.
 *
 * Ошибки валидации превращаются в 400 с разметкой по полям — форма
 * подсветит именно то поле, где проблема. Всё неопознанное отдаётся как
 * 500 без текста исключения: сообщение Prisma может содержать фрагменты
 * запроса и данные.
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.status, err.message, err.code);
    }
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return fail(400, 'Проверьте заполнение полей', 'VALIDATION', fields);
    }
    console.error('[api] необработанная ошибка:', err);
    return fail(500, 'Внутренняя ошибка сервера', 'INTERNAL');
  }
}

/** 429 с Retry-After: клиент должен знать, когда можно повторить. */
export function tooManyRequests(retryAfter: number) {
  return NextResponse.json<ApiError>(
    {
      error: `Слишком много попыток. Повторите через ${retryAfter} с.`,
      code: 'RATE_LIMITED',
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
