// @vitest-environment jsdom
/**
 * Форма на `useFormAction` в разметке сервера (до загрузки скриптов) не отправляется методом GET.
 *
 * Сверка 12.10.2026 (проверка PR #120): хук отдавал `{ ref, onSubmit, noValidate }` без `action`. Прежде формы
 * шли через `action={formAction}` и до гидрации уходили POST серверного действия; теперь серверная разметка
 * была обычной `<form novalidate>` без `method`, и отправка на медленном телефоне, с блокировщиком скриптов или
 * без пришедшего чанка делала нативный GET: `?newPassword=…&newPasswordConfirm=…`, пароль нового сотрудника,
 * ФИО, телефон и почта кандидата, токен ссылки восстановления — в адресной строке, истории и журналах Caddy.
 *
 * Серверное действие в разметке получает `method="POST"` и скрытые поля, потому что у ссылки на него есть
 * `$$FORM_ACTION` (так устроены настоящие серверные действия React). Здесь оно подделано теми же свойствами.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/passwords", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { changePasswordAction: make(), resetPasswordAction: make() };
});
vi.mock("@/app/(public)/invite/[token]/actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { acceptInvite: make() };
});
vi.mock("@/app/(agency)/a/candidates/actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return {
    createCandidateAction: make(),
    checkDuplicatesAction: make(),
    recordOfferAction: make(),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  unstable_isUnrecognizedActionError: () => false,
}));

import { InviteForm as ClientInviteForm } from "@/app/(public)/invite/[token]/invite-form";
import { ResetForm } from "@/app/(public)/reset/[token]/reset-form";
import { OfferForm } from "@/components/applications/offer-form";
import { QuickAddForm } from "@/components/candidates/quick-add-form";
import { CreateClientUserForm } from "@/components/clients/create-user-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ResetPasswordForm } from "@/components/shared/account-forms";
import { StaffCreateForm, StaffInviteForm } from "@/components/team/staff-forms";
import type { FormState } from "@/lib/form-state";
import { useFormAction } from "@/lib/hooks/use-form-action";
import { serverReference } from "../helpers/server-reference";

afterEach(cleanup);

const action = serverReference() as unknown as (prev: FormState, data: FormData) => Promise<FormState>;

/** Первый тег `<form …>` разметки: то, что браузер видит до загрузки скриптов. */
function formTag(html: string): string {
  const match = /<form\b[^>]*>/.exec(html);
  expect(match, "в разметке нет <form>").not.toBeNull();
  return match![0];
}

/** Форма уходит безопасно: POST серверного действия или перехват (`javascript:`), но не GET с полями в адресе. */
function expectNotGet(tag: string) {
  const method = /\bmethod="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase();
  const target = /\baction="([^"]*)"/i.exec(tag)?.[1];
  const intercepted = target !== undefined && target.startsWith("javascript:");
  expect(method === "post" || intercepted, `форма отправилась бы GET: ${tag}`).toBe(true);
}

describe("форма с useFormAction в разметке сервера", () => {
  function Demo() {
    const { formProps } = useFormAction(action, {});
    return (
      <form {...formProps}>
        <input name="password" type="password" />
        <button type="submit">Отправить</button>
      </form>
    );
  }

  it("серверное действие: method=POST и скрытые поля, а не GET", () => {
    const tag = formTag(renderToString(<Demo />));
    expect(tag).toMatch(/method="POST"/);
    expect(tag).toMatch(/encType="multipart\/form-data"/);
    expectNotGet(tag);
  });

  it("контроль: форма без action, как была у хука, — GET (это и ловит тест)", () => {
    function Legacy() {
      const { formProps } = useFormAction(action, {});
      const { ref, onSubmit, noValidate } = formProps;
      return (
        <form ref={ref} onSubmit={onSubmit} noValidate={noValidate}>
          <input name="password" type="password" />
        </form>
      );
    }
    const tag = formTag(renderToString(<Legacy />));
    expect(tag).not.toMatch(/method=/i);
    expect(() => expectNotGet(tag)).toThrow(/GET/);
  });

  it("после загрузки отправка по-прежнему идёт через onSubmit: action формы React не вызывает", async () => {
    const calls: FormData[] = [];
    const handler = async (_prev: FormState, data: FormData): Promise<FormState> => {
      calls.push(data);
      return { ok: "Готово" };
    };
    function Live() {
      const { formProps } = useFormAction(handler, {});
      return (
        <form {...formProps} aria-label="Форма">
          <input name="name" defaultValue="Анна" aria-label="Имя" />
          <button type="submit">Отправить</button>
        </form>
      );
    }
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<Live />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Отправить" }));
    await screen.findByRole("form", { name: "Форма" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].get("name")).toBe("Анна");
  });
});

describe("настоящие формы с паролями и данными кандидата", () => {
  const forms: Array<[string, () => React.ReactElement]> = [
    ["смена пароля", () => <PasswordForm />],
    ["сброс пароля по ссылке (токен в скрытом поле)", () => <ResetForm token="tok-secret" />],
    ["принятие приглашения (пароль)", () => <ClientInviteForm token="tok-secret" />],
    ["аккаунт пользователя клиента (пароль)", () => <CreateClientUserForm clientId="c1" action={action} />],
    ["перевыдача пароля", () => <ResetPasswordForm userId="u1" action={action} hint="Подсказка" />],
    [
      "приглашение сотрудника",
      () => <StaffInviteForm action={action} roles={[{ value: "RECRUITER", label: "Рекрутер" }]} grants={[]} />,
    ],
    [
      "аккаунт сотрудника (пароль)",
      () => <StaffCreateForm action={action} roles={[{ value: "RECRUITER", label: "Рекрутер" }]} grants={[]} />,
    ],
    ["быстрое добавление кандидата (ФИО, телефон, почта)", () => <QuickAddForm />],
    ["оффер", () => <OfferForm applicationId="a1" salary={null} position={null} startDate={null} />],
  ];

  it.each(forms)("%s: GET с полями в адресе невозможен", (_name, element) => {
    expectNotGet(formTag(renderToString(element())));
  });
});
