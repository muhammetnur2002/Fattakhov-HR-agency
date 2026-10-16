"use client";

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";
import { useStaleGuard } from "@/lib/hooks/use-stale-guard";
import { cn } from "@/lib/utils";

/**
 * Подтверждение опасного действия — один блок на весь кабинет.
 *
 * Кнопка («Удалить», «Отвязать», «Отозвать», «Отказать», «Стереть») не делает дела сразу, а на её месте
 * встаёт вопрос с двумя кнопками: «Да, …» и «Отмена». Раньше такой блок писали заново в каждом месте
 * (замер 7–8.10.2026: восемь копий; к 13.10 — девятнадцать блоков в восемнадцати файлах; после PR #119/#121 почти
 * все с одним хуком фокуса, но каждый со своей разметкой), и каждый вёл себя чуть иначе: у одного «Отмена» не блокировалась на время запроса, у другого
 * ошибка уходила в соседний угол страницы, у третьей Escape не работал, а двойное нажатие Enter
 * отправляло действие дважды. Теперь всё это — здесь, в одном месте:
 *
 * - **Фокус.** При открытии — на безопасную кнопку «Отмена» (случайный Enter ничего не сотрёт) либо, если
 *   в блоке есть поле (причина, слово-подтверждение), на первое поле. При закрытии — обратно на кнопку,
 *   которая блок открыла (`useConfirmFocus`). Если кнопки уже нет в странице (строку удалили), фокус никуда
 *   не прыгает.
 * - **Вопрос слышно один раз.** Он один в разметке (видимый или `sr-only`), на него ссылаются название
 *   группы (`role="group"` + `aria-labelledby`, у формы — просто `aria-labelledby`) и описание кнопки
 *   «Отмена» (`aria-describedby`): название группы при переводе фокуса читают не все читалки (например,
 *   VoiceOver на iPhone), описание кнопки — надёжнее. Копии вопроса «для читалки» не нужны.
 * - **Escape закрывает** блок и возвращает фокус; во время запроса — нет. Escape, который уже съел вложенный
 *   список (Select), блок не трогает (`defaultPrevented`).
 * - **Ожидание.** Кнопка «Да» показывает индикатор (`Button loading`), «Отмена» блокируется. Повторное нажатие после
 *   перерисовки гасит само отключение кнопки; два нажатия, что пришли до неё (одна пачка событий), — замок (`useRef`),
 *   страховка: тест `confirm-block.test.tsx` падает без него. Что обычный быстрый Enter приходит раньше перерисовки,
 *   не доказано, на этом замок не держится.
 * - **Ошибка — внутри блока**, под кнопками (`role="alert"`: в строке списка и в плотном блоке строкой, в блоке-абзаце
 *   плашкой, `errorLine` переопределяет), блок остаётся открытым — можно повторить или отменить. Фокус уходит на строку
 *   ошибки: кнопка на время запроса была отключена. То же у формы с `action`, когда после отправки фокус слетел на `<body>`.
 *   Сбой сети (действие бросает) превращается в понятную фразу, «страница устарела» не глотается
 *   (`useStaleGuard`).
 * - **Вид.** `destructive` — только у необратимого (по умолчанию). Размеры шрифтов и кнопок — из шкалы
 *   (`size`: `sm` по умолчанию, `default` у крупных блоков), ничего нового.
 *
 * Три режима записи (третий — `formProps` ниже):
 *
 * ```tsx
 * // Кнопка: ConfirmBlock сам открывается и закрывается, пока блок закрыт — показывает `trigger`
 * <ConfirmBlock
 *   trigger={<Button type="button" size="sm" variant="ghost">Удалить</Button>}
 *   question="Удалить файл?"
 *   confirmLabel="Да, удалить"
 *   pendingLabel="Удаляем…"
 *   onConfirm={async () => deleteFileAction(id)}   // { error } — покажем в блоке; иначе блок закроется
 * />
 *
 * // Форма (причина, слово-подтверждение): поля — детьми, отправка — обычная форма
 * <ConfirmBlock open={open} onOpenChange={setOpen} triggerRef={triggerRef}
 *   formProps={formProps} questionHidden question="Отказ кандидату: укажите причину"
 *   confirmLabel="Отказать" pending={pending}>
 *   <Textarea name="note" />
 * </ConfirmBlock>
 * ```
 *
 * Кнопка, которая открывает блок, может стоять в другом месте (шапка комментария, ряд соседних кнопок): тогда
 * `open` и `onOpenChange` — у родителя, а на кнопку вешается `triggerRef`. Блок всегда в разметке, когда
 * закрыт — не рисует ничего: хук фокуса живёт в нём и должен пережить закрытие.
 *
 * Новый блок «Да / Отмена» руками не пишется — `tests/confirm-block-rule.test.ts` не пропустит ни «Отмену»
 * рядом с красной кнопкой, ни «Да, …» вне этого компонента. Не считается только нижняя панель окна Radix
 * (`DialogFooter`, `AlertDialogFooter`: там «Отмена» и «Сохранить» — кнопки самого окна); тело окна проверяется, блок
 * подтверждения внутри окна пишется этим же компонентом (так сделано удаление задачи в календаре). Остальные исключения
 * перечислены в тесте с причинами. Внутри окна Radix Escape закрывает окно целиком, а не блок: библиотека
 * ловит его раньше и гасит событие (`defaultPrevented`), блок его не видит.
 */

/** Что вернуло дело: пусто — получилось (блок закроется), `{ error }` — показать и остаться, `false` — остаться молча. */
export type ConfirmResult = void | false | { error?: string | null };
type ConfirmTask = () => ConfirmResult | Promise<ConfirmResult>;

const NO_CONNECTION = "Не получилось: нет связи с сервером. Попробуйте ещё раз";

/** Поле блока: туда, а не на «Отмену», встаёт фокус при открытии. */
const FIELD =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled])';

type TriggerElement = ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>;

type Shared = {
  /** Открыт ли блок. Не задан — блок открывается и закрывается сам (нужен `trigger`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Кнопка, которую блок подменяет на месте: ссылку и нажатие подставляет сам блок. */
  trigger?: TriggerElement;
  /** Кнопка стоит в другом месте (у родителя): сюда блок возвращает фокус при закрытии. */
  triggerRef?: RefObject<HTMLElement | null>;

  /** Вопрос: «Удалить файл?». Короткий и о конкретной вещи — читалка называет им группу. */
  question: ReactNode;
  /** Вопроса на экране нет (поле само просит причину) — он остаётся только для читалки. */
  questionHidden?: boolean;
  /** Вопрос — подпись к полю: рисуется как `<Label htmlFor>` вместо абзаца. */
  questionFor?: string;
  questionClassName?: string;

  /** Подпись кнопки подтверждения: «Да, удалить». */
  confirmLabel: ReactNode;
  /** Подпись, пока идёт запрос: «Удаляем…». */
  pendingLabel?: ReactNode;
  /** `destructive` — только необратимое; `outline`/`default` — отказ и отмена, которые можно переиграть. */
  confirmVariant?: "destructive" | "default" | "outline";
  confirmClassName?: string;
  cancelLabel?: string;
  cancelVariant?: "ghost" | "outline";
  size?: "sm" | "default";

  /** `stack` — вопрос над кнопками, `inline` — вопрос и кнопки в одной строке (строки списков). */
  layout?: "stack" | "inline";
  /** Мелкий текст (12px) для плотных строк и врезок. */
  compact?: boolean;
  className?: string;
  /** Поля между вопросом и кнопками (причина, слово-подтверждение). */
  children?: ReactNode;

  /** Ошибка, показанная снаружи (проверка полей): рисуется в блоке, фокус не отбирает. */
  error?: string | null;
  /**
   * Ошибка строкой без рамки (`text-xs`) вместо плашки. По умолчанию — в строках списков и плотных блоках
   * (`layout="inline"`, `compact`); в блоке-абзаце — плашка, как у соседних форм.
   */
  errorLine?: boolean;
  /** Отступ ошибки, когда блок стоит в обычном потоке, а не во flex-ряду с `gap` (там отступ даёт `gap`). */
  errorClassName?: string;
  /** Идёт запрос, который ведёт родитель (форма через `useFormAction`, решение доски). */
  pending?: boolean;
  /** Ещё одно действие рядом с «Да» — `<ConfirmExtraAction task={…}>`: тот же замок, ожидание и ошибка, что и у `onConfirm`. */
  extraActions?: ReactNode;
};

export type ConfirmBlockProps =
  | (Shared & {
      /** Дело: вернёт `{ error }` — блок покажет и останется, пусто — закроется. */
      onConfirm: ConfirmTask;
      formProps?: undefined;
    })
  | (Shared & {
      /** Форма с полями: подтверждает кнопка отправки, дело — `action`/`onSubmit` формы. */
      formProps: ComponentProps<"form">;
      onConfirm?: undefined;
    });

const RunContext = createContext<{
  run: (task: ConfirmTask, key?: string) => void;
  busy: boolean;
  /** Какая кнопка сейчас выполняет дело: `confirm` — «Да», иначе ключ дополнительной кнопки. */
  active: string | null;
  size: "sm" | "default";
} | null>(null);

/**
 * Третий исход рядом с «Да» («Сохранить и закрыть» рядом с «Не сохранять»): кнопка проходит через тот же замок,
 * то же ожидание и ту же ошибку, что и `onConfirm`. Только внутри `extraActions` блока.
 */
export function ConfirmExtraAction({
  task,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { task: ConfirmTask }) {
  const api = useContext(RunContext);
  const key = useId();
  return (
    <Button
      type="button"
      size={api?.size}
      {...props}
      // Индикатор — у той кнопки, что нажата: «Да» рядом на это время только блокируется
      loading={props.loading || api?.active === key}
      disabled={props.disabled || api?.busy}
      onClick={() => api?.run(task, key)}
    />
  );
}

/** «Отмена»: недоступна, пока идёт запрос — своё и (в форме) отправка формы. */
function CancelButton({
  ref,
  label,
  variant,
  size,
  busy,
  watchForm,
  describedBy,
  onClick,
}: {
  ref: RefObject<HTMLButtonElement | null>;
  label: string;
  variant: "ghost" | "outline";
  size: "sm" | "default";
  busy: boolean;
  watchForm: boolean;
  describedBy: string;
  onClick: () => void;
}) {
  // Вне формы (или в чужой — блок «Отвязать» стоит внутри формы настроек) статус не наш
  const { pending: formPending } = useFormStatus();
  return (
    <Button
      ref={ref}
      aria-describedby={describedBy}
      type="button"
      size={size}
      variant={variant}
      disabled={busy || (watchForm && formPending)}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * Конец отправки формы (`action`): кнопка на время отправки была отключена, и фокус с неё слетел на <body>. Если после
 * ответа ошибка есть, а фокус потерян — ставим его на строку ошибки. Одна и та же ошибка при повторной попытке
 * (`error` не менялась) тоже находится: смотрим на конец отправки, а не на появление текста. Стоит внутри формы —
 * иначе `useFormStatus` её не видит. Фокус в поле или на кнопке не трогаем.
 */
function RefocusAfterSubmit({ error, target }: { error: string | null | undefined; target: RefObject<HTMLElement | null> }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || !error) return;
    const active = document.activeElement;
    if (!active || active === document.body) target.current?.focus();
  }, [pending, error, target]);
  return null;
}

export function ConfirmBlock(props: ConfirmBlockProps) {
  const {
    open,
    onOpenChange,
    trigger,
    triggerRef: externalTrigger,
    question,
    questionHidden = false,
    questionFor,
    questionClassName,
    confirmLabel,
    pendingLabel,
    confirmVariant = "destructive",
    confirmClassName,
    cancelLabel = "Отмена",
    cancelVariant = "ghost",
    size = "sm",
    layout = "stack",
    compact = false,
    className,
    children,
    error,
    errorLine,
    errorClassName,
    pending: externalPending = false,
    extraActions,
  } = props;

  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const [taskError, setTaskError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [transitionPending, startTransition] = useTransition();
  const busy = transitionPending || externalPending;
  const guardStale = useStaleGuard();
  const lock = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const errorRef = useRef<HTMLElement | null>(null);

  const { triggerRef, questionId, groupProps } = useConfirmFocus<HTMLElement>(isOpen, {
    triggerRef: externalTrigger,
    // Первое поле блока, иначе «Отмена»: ищем от кнопки, а не от контейнера — форма может принести свою ссылку
    resolveFocus: () =>
      cancelRef.current?.closest<HTMLElement>('[data-slot="confirm-block"]')?.querySelector<HTMLElement>(FIELD) ??
      cancelRef.current,
  });

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setTaskError(null);
      if (open === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  // Ошибка действия: кнопка на время запроса была отключена, и фокус с неё слетал на <body>
  useEffect(() => {
    if (taskError) errorRef.current?.focus();
  }, [taskError]);

  // Ошибка от формы, которую ведёт родитель (useActionState): после отправки кнопка тоже была отключена и фокус
  // слетел на <body>. Если фокус потерян — ставим его на строку ошибки; если человек в поле (проверка «Напишите
  // причину») — не отбираем. Ошибка, что была с самого начала, фокус не двигает.
  const seenError = useRef(error);
  useEffect(() => {
    const appeared = Boolean(error) && !seenError.current;
    seenError.current = error;
    if (!appeared || !isOpen) return;
    const active = document.activeElement;
    if (!active || active === document.body) errorRef.current?.focus();
  }, [error, isOpen]);

  const run = useCallback(
    (task: ConfirmTask, key = "confirm") => {
      if (lock.current) return;
      lock.current = true;
      setTaskError(null);
      setActive(key);
      startTransition(async () => {
        try {
          const result = await task();
          if (result === false) return;
          if (result && typeof result === "object" && result.error) {
            setTaskError(result.error);
            return;
          }
          setOpen(false);
        } catch (failure) {
          if (guardStale(failure)) return;
          setTaskError(NO_CONNECTION);
        } finally {
          lock.current = false;
          setActive(null);
        }
      });
    },
    [guardStale, setOpen],
  );

  if (!isOpen) {
    if (!trigger) return null;
    const original = trigger.props.onClick;
    return cloneElement(trigger as ReactElement<Record<string, unknown>>, {
      ref: triggerRef,
      onClick: (event: MouseEvent<HTMLElement>) => {
        original?.(event);
        if (!event.defaultPrevented) setOpen(true);
      },
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || busy) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }

  const inline = layout === "inline";
  const isForm = props.formProps !== undefined;
  const shownError = taskError ?? error;
  // «Да» показывает ожидание, когда дело ведёт оно само (или родитель, у формы); у соседней кнопки — только блокировка
  const confirmBusy = busy && (active === null || active === "confirm");
  const confirmText = confirmBusy && pendingLabel ? pendingLabel : confirmLabel;

  const questionNode = questionHidden ? (
    <span id={questionId} className="sr-only">
      {question}
    </span>
  ) : questionFor ? (
    <Label id={questionId} htmlFor={questionFor} className={questionClassName}>
      {question}
    </Label>
  ) : inline ? (
    <span id={questionId} className={cn(!compact && "text-sm", questionClassName)}>
      {question}
    </span>
  ) : (
    <p id={questionId} className={cn(!compact && "text-sm", questionClassName)}>
      {question}
    </p>
  );

  const confirmButton = isForm ? (
    <SubmitButton
      size={size}
      variant={confirmVariant}
      className={confirmClassName}
      loading={externalPending}
      pendingLabel={pendingLabel}
    >
      {confirmLabel}
    </SubmitButton>
  ) : (
    <Button
      type="button"
      size={size}
      variant={confirmVariant}
      className={confirmClassName}
      loading={confirmBusy}
      disabled={busy}
      onClick={() => run(props.onConfirm as ConfirmTask)}
    >
      {confirmText}
    </Button>
  );

  const buttons = (
    <>
      {extraActions}
      {confirmButton}
      <CancelButton
        ref={cancelRef}
        label={cancelLabel}
        variant={cancelVariant}
        size={size}
        busy={busy}
        watchForm={isForm}
        describedBy={questionId}
        onClick={() => setOpen(false)}
      />
    </>
  );

  // В строке списка ошибка встаёт следующей строкой ПОД блоком (`basis-full` в переносимом ряду родителя),
  // а не внутри узкого правого края; в блоке-абзаце — под кнопками
  const errorNode = (
    <FormMessage
      ref={errorRef}
      compact={errorLine ?? (inline || compact)}
      error={shownError}
      className={cn(inline && "basis-full", errorClassName)}
    />
  );
  const content = (
    <>
      {questionNode}
      {children}
      {isForm && <RefocusAfterSubmit error={shownError} target={errorRef} />}
      {inline ? buttons : <div className="flex flex-wrap gap-2">{buttons}</div>}
      {!inline && errorNode}
    </>
  );

  const shared = {
    "data-slot": "confirm-block",
    "data-layout": layout,
    "aria-busy": busy || undefined,
    onKeyDown,
    className: cn(inline ? "flex flex-wrap items-center gap-2" : "space-y-2", compact && "text-xs", className),
  };

  const block = props.formProps ? (
    <form {...props.formProps} {...shared} aria-labelledby={questionId}>
      {content}
    </form>
  ) : (
    <div {...groupProps} {...shared}>
      {content}
    </div>
  );
  return (
    <RunContext.Provider value={{ run, busy, active, size }}>
      {inline ? (
        <>
          {block}
          {errorNode}
        </>
      ) : (
        block
      )}
    </RunContext.Provider>
  );
}
