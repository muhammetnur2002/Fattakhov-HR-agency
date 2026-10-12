"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type RefObject,
} from "react";

import type { FieldErrors, FormState } from "@/lib/form-state";

/*
  Первое неверное поле формы: то, что `Field` пометил `aria-invalid`, или первая галочка
  группы, у которой есть ошибка. querySelector с перечнем возвращает первое по порядку в документе.
*/
const FIRST_INVALID =
  '[aria-invalid="true"], [data-slot="field-set"][data-invalid="true"] :is(input, button, select, textarea):not([type="hidden"])';

const NO_FIELDS: FieldErrors = {};

export type UseFormActionOptions = {
  /**
   * После успеха очистить форму. Для форм, что создают что-то («Создать аккаунт», «Пригласить»,
   * «Сменить пароль»): поля с паролем не должны висеть в странице, когда дело сделано. Формы правки
   * (профиль, оффер) оставляют набранное — это уже сохранённые значения.
   */
  resetOnSuccess?: boolean;
  /**
   * Что сделать ещё после успеха: сбросить управляемое состояние (выбранный пункт, режим «ответ»), которое
   * `form.reset()` не касается. Вызывается один раз на каждый успешный ответ.
   */
  onSuccess?: () => void;
  /**
   * Имена полей, которые стираются после отказа: текущий пароль, одноразовый код. Если отказ
   * относится к другим полям (`fields` без этого имени), оно остаётся — незачем набирать заново.
   */
  clearOnError?: readonly string[];
};

/** Данные формы вместе с кнопкой, что отправила (у формы с несколькими кнопками у каждой свой `name`). */
function readForm(form: HTMLFormElement, submitter: HTMLElement | null): FormData {
  let data: FormData;
  try {
    data = new FormData(form, submitter);
  } catch {
    data = new FormData(form);
  }
  // Старые WebKit игнорируют второй аргумент: имя и значение нажатой кнопки добавляем сами
  if (
    (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
    submitter.name &&
    !data.has(submitter.name)
  ) {
    data.append(submitter.name, submitter.value);
  }
  return data;
}

/**
 * Форма с серверным действием, которая не теряет набранное.
 *
 * Зачем. `<form action={formAction}>` в React 19 после ответа очищает все неуправляемые поля — и
 * тогда, когда сервер ответил отказом. «ИНН уже занят» стирал заполненную анкету, «пароли не
 * совпадают» — всё, что человек вводил. Здесь форма уходит через `onSubmit` и `startTransition`,
 * и React её не очищает; ответ приходит так же, как у `useActionState`.
 *
 * Что делает сверх этого:
 * - нативная проверка браузера выключена (`noValidate`): её пузырёк на английском и без привязки
 *   к нашему оформлению, а все правила и так проверяет сервер (zod), текст отказа — по-русски,
 *   у самого поля (`fields` в ответе действия, `Field` из `components/ui/field.tsx`);
 * - после отказа фокус на первом неверном поле, а при общей ошибке — на плашке. Кнопка отправки
 *   на время запроса отключалась, и фокус с неё слетал на `<body>`: клавиатурный пользователь
 *   оказывался в начале страницы;
 * - `pending` — для `SubmitButton loading` (`useFormStatus` форму с `onSubmit` не видит);
 * - повторная отправка, пока идёт прошлая, игнорируется — Enter в поле быстрее перерисовки кнопки.
 *
 * Пароли и коды из формы никуда не уходят, кроме самого запроса: ни в состояние, ни в хранилище,
 * ни обратно из действия. Отказ стирает `clearOnError`, успех — `resetOnSuccess`.
 *
 * ```tsx
 * const { state, pending, formProps } = useFormAction(saveAction, {});
 * <form {...formProps} className="space-y-4">
 *   <Field label="Имя" error={state.fields?.fullName}><Input name="fullName" /></Field>
 *   <SubmitButton loading={pending}>Сохранить</SubmitButton>
 *   <FormMessage error={state.error} ok={state.ok} />
 * </form>
 * ```
 *
 * «Страница устарела» (UnrecognizedActionError) здесь ловить не нужно: исключение действия
 * `useActionState` отдаёт ближайшей границе ошибок само. Если вокруг вызова пишется свой `catch`,
 * первой строкой — `if (guardStale(error)) return;` (`useStaleGuard`).
 */
export function useFormAction<S extends FormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initialState: S,
  options: UseFormActionOptions = {},
) {
  const [state, formAction, pending] = useActionState<S, FormData>(action, initialState as Awaited<S>);
  const formRef = useRef<HTMLFormElement>(null);
  // Плашка результата, если она стоит не внутри формы, а рядом (`<FormMessage ref={messageRef} />`)
  const messageRef = useRef<HTMLElement>(null);
  // Кнопка, что отправила форму: на неё возвращается фокус, если уходить ему больше некуда
  const submitterRef = useRef<HTMLElement | null>(null);
  const handled = useRef(state);
  const inFlight = useRef(false);
  // Свежие параметры без перезапуска эффекта: массив `clearOnError` обычно пишут литералом, и он новый
  // на каждую отрисовку. Читаются только в момент нового ответа
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    inFlight.current = pending;
  }, [pending]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (inFlight.current) return;
      inFlight.current = true;
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      submitterRef.current = submitter;
      const data = readForm(event.currentTarget, submitter);
      startTransition(() => formAction(data));
    },
    [formAction],
  );

  useEffect(() => {
    // Только на новый ответ: первая отрисовка и повторные эффекты Strict Mode — не ответ
    if (handled.current === state) return;
    handled.current = state;
    // Ответ пришёл — следующая отправка свободна, даже если `pending` не успел побывать истинным
    inFlight.current = false;
    const { resetOnSuccess = false, clearOnError, onSuccess } = optionsRef.current;
    const form = formRef.current;

    // Кнопка на время запроса была отключена, и фокус с неё слетал на <body>: клавиатурный пользователь
    // оказывался в начале страницы. Возвращаем его на кнопку, только если он больше нигде не стоит
    const restoreFocus = () => {
      const submitter = submitterRef.current;
      const active = document.activeElement;
      if (submitter?.isConnected && (!active || active === document.body)) submitter.focus();
    };

    if (state.error || state.fields) {
      if (form) {
        // Стираем поле, к которому отказ относится (неверный текущий пароль), а при общем отказе без
        // полей (слишком частые попытки) — все перечисленные; остальное человек набирал не зря
        for (const name of clearOnError ?? []) {
          if (state.fields && !(name in state.fields)) continue;
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLInputElement) control.value = "";
        }
      }
      // Первое неверное поле, иначе плашка: внутри формы или рядом с ней (`messageRef`)
      const target =
        form?.querySelector<HTMLElement>(FIRST_INVALID) ??
        form?.querySelector<HTMLElement>('[data-form-message="error"]') ??
        messageRef.current;
      if (target) target.focus();
      else restoreFocus();
    } else if (state.ok) {
      if (form && resetOnSuccess) form.reset();
      onSuccess?.();
      restoreFocus();
    }
  }, [state]);

  return {
    state,
    pending,
    /** Ошибки полей из ответа; пустой объект, пока всё в порядке. */
    fields: state.fields ?? NO_FIELDS,
    /**
     * Обычное действие формы (`<form action={formAction}>`) — для форм из одних кнопок, где терять
     * нечего: `useFormStatus` в `SubmitButton` видит такую форму сам, без `loading`.
     */
    formAction,
    formRef: formRef as RefObject<HTMLFormElement | null>,
    /**
     * Ссылка для `<FormMessage ref={messageRef} />`, когда плашка результата стоит ВНЕ формы (после неё,
     * рядом): после общего отказа фокус идёт на неё, а не слетает на `<body>`. Внутри формы не нужна.
     */
    messageRef: messageRef as RefObject<HTMLElement | null>,
    /**
     * `<form {...formProps}>` — ссылка, отправка и выключенная проверка браузера.
     *
     * `action` обязателен: без него форма в разметке сервера — обычная GET-форма, и отправка до загрузки
     * скриптов (медленный телефон, блокировщик, не пришёл чанк) уносила бы пароль, токен ссылки и данные
     * кандидата в адресную строку, историю и журналы сервера. С `action={formAction}` серверное действие
     * получает форму как обычный POST (React отдаёт `method="POST"` и скрытые поля), а действие-функция
     * без серверной ссылки отправку до гидрации перехватывает и повторяет после неё. После загрузки
     * `onSubmit` гасит стандартную отправку, и React `action` не вызывает.
     */
    formProps: { ref: formRef, action: formAction, onSubmit, noValidate: true },
  };
}
