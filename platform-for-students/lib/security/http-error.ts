/** Ошибка с кодом ответа — `handle()` из lib/api.ts превращает её в JSON с нужным статусом. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
