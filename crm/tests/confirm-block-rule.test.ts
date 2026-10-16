/**
 * Подтверждение опасного действия — только через ConfirmBlock (components/ui/confirm-block.tsx).
 *
 * Замер 7–8.10.2026: «Да / Отмена» был написан руками в двадцати местах. После PR #119/#121 у блоков появился общий
 * хук фокуса, но разметка осталась копией: вопрос, две кнопки, ожидание, ошибка — каждый раз заново и каждый раз
 * чуть иначе (где-то «Отмена» не блокировалась на время запроса, где-то ошибка уходила в соседний угол страницы,
 * где-то не работал Escape, где-то двойной Enter отправлял действие дважды). Теперь блок один, а этот сторож не даёт
 * написать двадцать первый.
 *
 * Нарушение — «ручной блок»: в файле вне ConfirmBlock есть кнопка отмены («Отмена», «Оставить», «Не отменять»,
 * «Нет», «Назад», «Не удалять») и опасная кнопка (`variant="destructive"` или подпись «Да, …»). Исключение одно:
 * нижняя панель окна Radix (`DialogFooter`, `AlertDialogFooter`, …) — там «Отмена» и «Сохранить» принадлежат самому
 * окну, а фокус ведёт библиотека. Тело окна (`DialogContent`) под исключение не попадает: блок «Удалить / Не удалять»
 * внутри окна календаря стоял именно в теле, и прежнее исключение «всё содержимое окна» его не замечало. Остальные
 * исключения — в EXCEPTIONS, с причиной, и каждое проверяется на живость.
 *
 * Чего сторож не видит: форму с полем и обычной кнопкой («Отклонить с пояснением» + «Отмена»). Её не отличить от
 * раскрывашки «Создать» + «Отмена»; такие места держат INVENTORY ниже (файл обязан рисовать <ConfirmBlock>) и
 * selection-rule (раскрывашка обязана вести фокус). На исходниках до перевода сторож узнавал 14 мест из 18, остальные
 * четыре — link-request-actions, decision-panel, client-vacancy-actions, revoke-invite-button. Четвёртое с 16.10.2026
 * подтверждения не требует вовсе (решение владельца, см. NOT_CONFIRMED ниже): остаются три.
 */
import { describe, expect, it } from "vitest";

import { findManualConfirms } from "./helpers/confirm-block-source";
import { jsxTree, read, sources, stripComments } from "./helpers/jsx-source";

const files = [...sources("app"), ...sources("components")].filter(
  (f) => !f.endsWith("components/ui/confirm-block.tsx") && !f.includes("components/marketing/"),
);

/** Исключения: файл → почему там допустима своя пара «отмена + опасная». Ни одного — это нормально. */
const EXCEPTIONS: Record<string, string> = {};

describe("ConfirmBlock — единственный блок подтверждения", () => {
  it("вне ConfirmBlock нет пары «кнопка отмены + опасная кнопка» (кроме нижней панели окна Radix и перечня с причинами)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (EXCEPTIONS[file]) continue;
      const { cancels, dangers } = findManualConfirms(read(file));
      if (cancels.length > 0 && dangers.length > 0) {
        offenders.push(`${file} (отмена: строка ${cancels[0].line}, опасная: строка ${dangers[0].line})`);
      }
    }
    expect(
      offenders,
      "подтверждение опасного действия пишется через <ConfirmBlock> (components/ui/confirm-block.tsx): вопрос, «Да», «Отмена», " +
        "ожидание, ошибка, Escape и фокус там уже есть",
    ).toEqual([]);
  });

  it("исключения живые: файл существует и в нём всё ещё есть ручная пара", () => {
    for (const [file, reason] of Object.entries(EXCEPTIONS)) {
      expect(reason.length, `${file}: у исключения нет причины`).toBeGreaterThan(20);
      const { cancels, dangers } = findManualConfirms(read(file));
      expect(cancels.length > 0 && dangers.length > 0, `${file}: исключение больше не нужно — уберите его`).toBe(true);
    }
  });

  it("кнопка «Да, …» существует только как confirmLabel блока: не рядом с ним и не в самодельной разметке", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(read(file));
      const tree = jsxTree(source);
      const blocks = tree.filter((n) => n.name === "ConfirmBlock");
      for (const m of source.matchAll(/(>\s*|["'`])Да, [а-яё]/g)) {
        const at = m.index ?? 0;
        const inBlockTag = blocks.some((b) => at > b.index && at < b.index + b.text.length);
        if (!inBlockTag) offenders.push(`${file}:${source.slice(0, at).split("\n").length}`);
      }
    }
    expect(offenders, "«Да, …» — подпись кнопки подтверждения: confirmLabel=\"Да, …\" у <ConfirmBlock>").toEqual([]);
  });

  describe("сторож жив: узнаёт ручной блок в синтетическом коде", () => {
    const manual = `
      export function X() {
        return (
          <div>
            <p>Удалить?</p>
            <Button variant="destructive" onClick={run}>Да, удалить</Button>
            <Button variant="ghost" onClick={close}>Отмена</Button>
          </div>
        );
      }`;

    it("красная кнопка + «Отмена» — нарушение", () => {
      const { cancels, dangers } = findManualConfirms(manual);
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(1);
    });

    it("«Оставить» и «Да, …» без variant — тоже нарушение", () => {
      const { cancels, dangers } = findManualConfirms(
        `<span><Button onClick={a}>Да, отозвать</Button><Button onClick={b}>Оставить</Button></span>`,
      );
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(1);
    });

    it("SubmitButton с variant=destructive рядом с «Отмена» — нарушение", () => {
      const { cancels, dangers } = findManualConfirms(
        `<form><SubmitButton variant="destructive">Удалить</SubmitButton><Button type="button">Отмена</Button></form>`,
      );
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(1);
    });

    it("то же через ConfirmBlock — чисто: кнопка-триггер и подписи лежат в его теге", () => {
      const { cancels, dangers } = findManualConfirms(`
        <ConfirmBlock
          trigger={<Button variant="destructive">Удалить</Button>}
          question="Удалить?"
          confirmLabel="Да, удалить"
          cancelLabel="Оставить"
          onConfirm={run}
        />`);
      expect(cancels).toHaveLength(0);
      expect(dangers).toHaveLength(0);
    });

    it("нижняя панель окна Radix: «Отмена» и красная кнопка в DialogFooter не считаются — фокус ведёт библиотека", () => {
      const { cancels, dangers } = findManualConfirms(`
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Отмена</Button>
              <Button variant="destructive" onClick={run}>Удалить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>`);
      expect(cancels).toHaveLength(0);
      expect(dangers).toHaveLength(0);
    });

    it("AlertDialogFooter — тоже нижняя панель окна", () => {
      const { cancels, dangers } = findManualConfirms(`
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogFooter>
              <Button variant="outline">Отмена</Button>
              <Button variant="destructive">Да, удалить</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>`);
      expect(cancels).toHaveLength(0);
      expect(dangers).toHaveLength(0);
    });

    it("блок «Удалить / Не удалять» в ТЕЛЕ окна Radix — нарушение (так стояло удаление задачи в календаре)", () => {
      const { cancels, dangers } = findManualConfirms(`
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent>
            <div className="flex flex-wrap items-center gap-2">
              {confirming ? (
                <span {...groupProps} className="flex flex-wrap items-center gap-2">
                  <span id={questionId}>Удалить?</span>
                  <Button type="button" variant="destructive" loading={pending} onClick={remove}>Удалить</Button>
                  <Button ref={focusRef} type="button" variant="outline" onClick={() => setConfirming(false)}>Не удалять</Button>
                </span>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>`);
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(1);
    });

    it("«Да, …» + «Отмена» в теле окна Radix — тоже нарушение", () => {
      const { cancels, dangers } = findManualConfirms(`
        <Sheet open>
          <SheetContent>
            <Button onClick={run}>Да, закрыть</Button>
            <Button variant="ghost" onClick={close}>Отмена</Button>
          </SheetContent>
        </Sheet>`);
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(1);
    });

    it("«Отмена» у формы без опасной кнопки (раскрывашка, создание) — не подтверждение", () => {
      const { cancels, dangers } = findManualConfirms(
        `<form><Button type="submit">Создать</Button><Button type="button" variant="ghost">Отмена</Button></form>`,
      );
      expect(cancels).toHaveLength(1);
      expect(dangers).toHaveLength(0);
    });

    it("упоминание в комментарии не считается", () => {
      const { cancels, dangers } = findManualConfirms(`
        {/* <Button variant="destructive">Да, удалить</Button> <Button>Отмена</Button> */}
        // <Button variant="destructive">Да, удалить</Button>
        <p>ничего</p>`);
      expect(cancels).toHaveLength(0);
      expect(dangers).toHaveLength(0);
    });
  });
});

/**
 * Что подтверждается и где (инвентаризация 13.10.2026, семнадцать файлов после 16.10.2026). Файл должен рисовать
 * <ConfirmBlock>: если блок вернули к ручной разметке, список покраснеет раньше, чем сторож выше заметит пару кнопок.
 */
const INVENTORY: Record<string, string> = {
  "app/(agency)/a/clients/link-requests/link-request-actions.tsx": "заявка на привязку: «Отклонить» с пояснением (форма с полем)",
  "app/(agency)/a/reviews/moderation/moderation-board.tsx": "модерация вакансии студплатформы: «Отклонить» с причиной",
  "app/(agency)/a/reviews/study/study-board.tsx": "справка об учёбе: «Вернуть справку» с причиной",
  "app/(client)/students/clear-closed.tsx": "студплатформа: удалить снятые и отклонённые вакансии пачкой",
  "app/(client)/students/vacancy-actions.tsx": "студплатформа: удалить вакансию; снять с публикации (сохранить / не сохранять)",
  "components/applications/decision-panel.tsx": "решение клиента: «Отказать» кандидату с причиной",
  "components/calendar/task-dialogs.tsx": "календарь: удалить задачу в карточке задачи (с выбором области у повторяющейся)",
  "components/candidates/candidate-files.tsx": "файл кандидата: удалить (в строке списка)",
  "components/clients/contract-template-manager.tsx": "шаблон договора: удалить",
  "components/clients/deletion-request.tsx": "владелец: подтвердить удаление аккаунта клиента",
  "components/comments/comment-thread.tsx": "комментарий: удалить (свой и чужой)",
  "components/interviews/calendar-subscription.tsx": "подписка на календарь: обновить ссылку (старая перестанет работать)",
  "components/pdn/erase-button.tsx": "персональные данные кандидата: стереть безвозвратно (форма со словом-подтверждением)",
  "components/settings/delete-account.tsx": "свой аккаунт: удалить или запросить удаление",
  "components/settings/vk-link-block.tsx": "ВКонтакте: отвязать страницу",
  "components/vacancies/client-vacancy-actions.tsx": "вакансия клиента: «Отменить заявку» с причиной",
  "components/vacancies/delete-vacancies.tsx": "закрытые вакансии: удалить (одну или пачкой)",
};

describe("инвентаризация: где подтверждается опасное действие", () => {
  it.each(Object.entries(INVENTORY))("%s рисует ConfirmBlock — %s", (file) => {
    expect(read(file)).toMatch(/<ConfirmBlock\b/);
  });
});

/**
 * Что НЕ подтверждается — по решению владельца, а не по недосмотру (16.10.2026).
 *
 * Отзыв приглашения (три экрана) с 13.10 переспрашивал через ConfirmBlock и был в INVENTORY; владелец вернула прежнее
 * поведение: «Отозвать» отзывает с первого нажатия. Причина: действие обратимо — приглашение создаётся заново, и это
 * новая ссылка; потерять нечего. Файл не должен рисовать ConfirmBlock и не должен содержать пару «Отмена + Да, отозвать».
 * Вернуть вопрос можно только по новому решению владельца: тогда файл переезжает отсюда в INVENTORY.
 */
const NOT_CONFIRMED: Record<string, string> = {
  "components/settings/revoke-invite-button.tsx":
    "приглашение: отозвать одним нажатием (обратимо: приглашение создаётся заново), решение владельца 16.10.2026",
};

describe("решено не подтверждать: файл не рисует ConfirmBlock", () => {
  it.each(Object.entries(NOT_CONFIRMED))("%s — %s", (file, reason) => {
    expect(reason.length, `${file}: у исключения нет причины`).toBeGreaterThan(20);
    const source = stripComments(read(file));
    expect(source, "по решению владельца отзыв приглашения не переспрашивает").not.toMatch(/<ConfirmBlock\b/);
    expect(source).not.toMatch(/confirm-block/);
    expect(source).not.toMatch(/Да, отозвать|Отозвать приглашение\?|Отмена/);
    // Сторож пары «отмена + опасная» тоже молчит: «Отозвать» — обычная кнопка отправки формы
    const { cancels, dangers } = findManualConfirms(read(file));
    expect(cancels).toHaveLength(0);
    expect(dangers).toHaveLength(0);
  });

  it("отзыв приглашения не в INVENTORY: перечень подтверждений и перечень «не подтверждается» не пересекаются", () => {
    for (const file of Object.keys(NOT_CONFIRMED)) {
      expect(Object.keys(INVENTORY), `${file} — и в INVENTORY, и в NOT_CONFIRMED`).not.toContain(file);
    }
  });

  it("кнопку по-прежнему рисуют все три экрана (иначе исключение ни к чему не относится)", () => {
    const screens = [
      "app/(agency)/a/clients/[id]/page.tsx",
      "app/(client)/settings/page.tsx",
      "components/team/staff-invitations.tsx",
    ];
    for (const file of screens) expect(read(file), file).toMatch(/<RevokeInviteButton\b/);
  });
});
