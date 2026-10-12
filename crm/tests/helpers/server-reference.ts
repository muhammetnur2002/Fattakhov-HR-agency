/**
 * Подделка ссылки на серверное действие, какой её видит клиентский компонент.
 *
 * Настоящая ссылка (`createServerReference` React) несёт `$$FORM_ACTION` — по нему сервер рисует форму
 * с `method="POST"` и скрытыми полями, так что отправка до загрузки скриптов доходит до действия, — и
 * переопределённый `bind`, что эти свойства сохраняет (`useActionState` привязывает к действию состояние).
 * Тесты разметки сервера (`renderToString`) без этого видели бы обычную функцию и `javascript:` в `action`.
 */
export type ServerReference<A extends unknown[] = unknown[], R = unknown> = ((...args: A) => Promise<R>) & {
  $$FORM_ACTION: (prefix: string) => {
    name: string;
    action: string;
    method: string;
    encType: string;
    data: null;
  };
};

export function serverReference<A extends unknown[] = unknown[], R = unknown>(): ServerReference<A, R> {
  const reference = (async () => ({})) as unknown as ServerReference<A, R>;
  reference.$$FORM_ACTION = (prefix) => ({
    name: prefix,
    action: "",
    method: "POST",
    encType: "multipart/form-data",
    data: null,
  });
  reference.bind = function (this: ServerReference<A, R>, thisArg: unknown, ...args: unknown[]) {
    const bound = Function.prototype.bind.call(this, thisArg, ...args) as ServerReference<A, R>;
    bound.$$FORM_ACTION = this.$$FORM_ACTION;
    return bound;
  } as typeof reference.bind;
  return reference;
}
