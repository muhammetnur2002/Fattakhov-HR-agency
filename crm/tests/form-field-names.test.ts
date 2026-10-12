/**
 * Имена полей в ответе действия совпадают с именами в форме (замечание проверки PR #120, 12.10.2026).
 *
 * Действие отвечает `fields: { <имя поля>: "текст" }` (`invalidForm` берёт ключ из пути схемы), а форма показывает
 * текст под полем по `fields.<имя>`. Опечатка с любой стороны, переименованное поле или поле схемы, которого в форме нет,
 * дают сводку «Проверьте заполнение полей» без указания, что неверно: человек ищет ошибку глазами. Прежде контракт
 * проверялся только e2e на трёх формах. Здесь — для каждой пары (схема, форма): каждый ключ схемы либо есть в форме
 * (`name="…"`) и показывается (`fields.…`), либо назван в перечне исключений с причиной.
 */
import { describe, expect, it } from "vitest";

import { filesMatching, read } from "./helpers/jsx-source";
import { acceptInviteSchema, profileSchema } from "@/lib/validation/auth";
import {
  guaranteeCaseSchema,
  offerSchema,
  presentSchema,
  quickCandidateSchema,
  rejectSchema,
} from "@/lib/validation/candidate";
import {
  clientSchema,
  createClientUserSchema,
  inviteUserSchema,
  resetClientUserPasswordSchema,
} from "@/lib/validation/client";
import { changePasswordSchema, resetPasswordSchema } from "@/lib/validation/password";
import { createStaffSchema, inviteStaffSchema, resetStaffPasswordSchema, updateStaffSchema } from "@/lib/validation/staff";
import { companyProfileSchema } from "@/lib/services/company-profile";

type Pair = {
  title: string;
  schema: unknown;
  /** Файл формы и, если в нём несколько форм, имя функции-компонента. */
  form: string;
  fn?: string;
  /** Ключ схемы, которого нет в форме или который не показывает свою ошибку у поля — с причиной. */
  except?: Record<string, string>;
};

const HIDDEN = "скрытое поле: человек его не правит, ошибка общая";

const PAIRS: Pair[] = [
  {
    title: "быстрое добавление кандидата",
    schema: quickCandidateSchema,
    form: "components/candidates/quick-add-form.tsx",
    except: {
      currentPosition: "поля профиля до согласия не сохраняются; форма их не показывает, сервис отклоняет присланные",
      currentCompany: "то же",
      city: "то же",
      salaryExpectation: "то же",
    },
  },
  { title: "представление клиенту", schema: presentSchema, form: "components/applications/present-form.tsx", fn: "PresentForm" },
  {
    title: "отказ рекрутера",
    schema: rejectSchema,
    form: "components/applications/present-form.tsx",
    fn: "RejectForm",
    except: { rejectedBy: HIDDEN },
  },
  {
    title: "отказ клиента",
    schema: rejectSchema,
    form: "components/applications/decision-panel.tsx",
    except: { rejectedBy: HIDDEN },
  },
  { title: "оффер", schema: offerSchema, form: "components/applications/offer-form.tsx" },
  {
    title: "гарантийный случай",
    schema: guaranteeCaseSchema,
    form: "components/applications/guarantee-case-form.tsx",
    except: { reopenVacancy: "галочка: ошибки у неё быть не может, строка «on» или пусто" },
  },
  { title: "карточка клиента", schema: clientSchema, form: "components/clients/client-form.tsx" },
  { title: "аккаунт пользователя клиента", schema: createClientUserSchema, form: "components/clients/create-user-form.tsx" },
  {
    title: "перевыдача пароля пользователю клиента",
    schema: resetClientUserPasswordSchema,
    form: "components/shared/account-forms.tsx",
    except: { userId: HIDDEN },
  },
  { title: "приглашение коллеги клиента", schema: inviteUserSchema, form: "components/clients/invite-form.tsx" },
  // Роль, должность и доступы стоят в общих кусочках файла (RoleFields, GrantsFieldset): проверяется файл целиком
  { title: "аккаунт сотрудника", schema: createStaffSchema, form: "components/team/staff-forms.tsx" },
  { title: "приглашение сотрудника", schema: inviteStaffSchema, form: "components/team/staff-forms.tsx" },
  {
    title: "правка сотрудника",
    schema: updateStaffSchema,
    form: "components/team/staff-forms.tsx",
    except: { userId: HIDDEN },
  },
  {
    title: "смена пароля",
    schema: changePasswordSchema,
    form: "components/settings/password-form.tsx",
  },
  {
    title: "сброс пароля по ссылке",
    schema: resetPasswordSchema,
    form: "app/(public)/reset/[token]/reset-form.tsx",
    except: { token: `${HIDDEN} (действие показывает её общим сообщением)` },
  },
  { title: "принятие приглашения", schema: acceptInviteSchema, form: "app/(public)/invite/[token]/invite-form.tsx" },
  { title: "профиль в настройках", schema: profileSchema, form: "components/settings/profile-form.tsx" },
  { title: "профиль компании клиента", schema: companyProfileSchema, form: "components/client/company-profile-form.tsx" },
];

// Пароль сброса сотрудника лежит в той же форме, что и клиентский: отдельная пара ниже
PAIRS.push({
  title: "перевыдача пароля сотруднику",
  schema: resetStaffPasswordSchema,
  form: "components/shared/account-forms.tsx",
  except: { userId: HIDDEN },
});

function keysOf(schema: unknown): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) throw new Error("схема не объект: у неё нет shape");
  return Object.keys(shape);
}

/** Тело компонента: от `function Имя` до следующего компонента верхнего уровня. */
function bodyOf(text: string, fn?: string): string {
  if (!fn) return text;
  const start = text.search(new RegExp(`function ${fn}\\b`));
  expect(start, `в файле нет функции ${fn}`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n(?:export )?(?:default )?function [A-Z]/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

const namesIn = (src: string) => new Set([...src.matchAll(/\bname=["'{]+([A-Za-z]\w*)["'}]/g)].map((m) => m[1]));
const shownIn = (src: string) =>
  new Set(
    [
      ...src.matchAll(/\b(?:fields|errors|fieldErrors)\??\.([A-Za-z]\w*)/g),
      ...src.matchAll(/\b(?:fields|errors|fieldErrors)\??\.?\[["'](\w+)["']\]/g),
    ].map((m) => m[1]),
  );

describe.each(PAIRS)("$title", ({ schema, form, fn, except = {} }) => {
  const source = bodyOf(read(form), fn);
  const names = namesIn(source);
  const shown = shownIn(source);

  it("каждый ключ схемы есть в форме (name) и показывает свою ошибку у поля (fields.…)", () => {
    const missingName: string[] = [];
    const notShown: string[] = [];
    for (const key of keysOf(schema)) {
      if (key in except) continue;
      if (!names.has(key)) missingName.push(key);
      if (!shown.has(key)) notShown.push(key);
    }
    expect(missingName, `${form}: в форме нет поля с таким name — ответ действия не найдёт, куда лечь`).toEqual([]);
    expect(notShown, `${form}: ошибка по этому ключу пришла бы, а форма её не покажет (fields.<ключ>)`).toEqual([]);
  });

  it("исключения не устарели: ключ есть в схеме", () => {
    const keys = new Set(keysOf(schema));
    expect(Object.keys(except).filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe("токен ссылки восстановления", () => {
  it("пустой токен получает русское сообщение, а не текст zod по умолчанию", () => {
    const result = resetPasswordSchema.safeParse({ token: "", newPassword: "длинная-фраза-77", newPasswordConfirm: "длинная-фраза-77" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "token");
    expect(issue?.message).toMatch(/[А-Яа-я]/);
    expect(issue?.message).not.toMatch(/Too small|expected string/i);
  });
});

describe("отказ сервиса и поле", () => {
  it("действия привязывают отказ к полю по пометке сервиса (serviceFailure), а не по классу ошибки", () => {
    // `if (error instanceof StaffError) return { fields: { email: error.message } }` — любой новый отказ того же
    // класса лёг бы под поле почты. Пометка `field` у PasswordError, EmailConfirmError, StaffError, InviteError,
    // ClientUserError ставится там, где сервис бросает ошибку
    const offenders = filesMatching("app", /(^|\/)[\w-]*actions?\.ts$/).filter((file) =>
      /instanceof\s+\w+Error\)\s*\{?\s*return\s*\{\s*fields:\s*\{\s*\w+:\s*error\.message/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});
