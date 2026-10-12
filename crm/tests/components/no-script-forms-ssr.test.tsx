// @vitest-environment jsdom
/**
 * Формы на клиентском коде в разметке сервера (пока скрипты не загрузились) не отправляются GET-ом.
 *
 * Сверка 12.10.2026 (после PR #121): двенадцать форм с `onSubmit` и `preventDefault`, но без `action` и `method` —
 * вход по номеру, 2FA, анкета регистрации, правка кандидата и брифа, задания, два загрузчика договора, сообщения
 * студентам, поиск. В браузере с неподгруженными скриптами нажатие Enter в них давало `/settings?proof=<пароль>`
 * и `/onboarding?company=<название>`: поля в адресной строке, истории и журналах Caddy.
 *
 * Здесь рендерятся настоящие компоненты (`renderToString`), как их получает браузер до гидрации. Серверные действия
 * подделаны свойствами настоящей ссылки (`$$FORM_ACTION`, см. helpers/server-reference.ts): React рисует для них
 * `method="POST"`. Формы, которые есть только после загрузки данных в браузере (задания в диалоге, переписка со
 * студентом), в разметку сервера не попадают — их держит источниковый сторож `tests/form-submit-guard.test.ts`.
 */
import { cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/quick-auth", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { phoneSignInAction: make(), requestPhoneCodeAction: make() };
});
vi.mock("@/app/actions/two-factor", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return {
    confirmTwoFactorAction: make(),
    disableTwoFactorAction: make(),
    regenerateCodesAction: make(),
    requestTwoFactorSmsAction: make(),
    startTwoFactorAction: make(),
  };
});
vi.mock("@/app/(onboarding)/onboarding/actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { completeBriefAction: make() };
});
vi.mock("@/app/(agency)/a/candidates/extras-actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { updateCandidateProfileAction: make() };
});
vi.mock("@/app/(agency)/a/vacancies/edit-actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { updateVacancyBriefAction: make() };
});
vi.mock("@/app/(client)/documents/actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { uploadSignedContractAction: make() };
});
vi.mock("@/app/(agency)/a/clients/actions", async () => {
  const make = (await import("../helpers/server-reference")).serverReference;
  return { deleteContractTemplateAction: make(), uploadContractTemplateAction: make() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  unstable_isUnrecognizedActionError: () => false,
}));

import { PhoneLogin } from "@/components/auth/phone-login";
import { CandidateEditForm } from "@/components/candidates/candidate-edit-form";
import { ContractUpload } from "@/components/client/contract-upload";
import { ContractTemplateManager } from "@/components/clients/contract-template-manager";
import { BriefWizard } from "@/components/onboarding/brief-wizard";
import { StartSetup } from "@/components/settings/two-factor";
import { GlobalSearchField } from "@/components/shell/global-search-field";
import { BriefEditForm } from "@/components/vacancies/brief-edit-form";
import { NO_SCRIPT_FORM_PATH } from "@/lib/forms/no-script";

afterEach(cleanup);

/** Теги `<form …>` разметки: то, что браузер видит до загрузки скриптов. */
function formTags(html: string): string[] {
  return [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1];

describe("форма на клиентском коде отправляется POST на приёмник, а не GET", () => {
  const forms: Array<[string, () => React.ReactElement]> = [
    ["вход и регистрация по номеру (первый шаг)", () => <PhoneLogin consent requireConsent={false} submitLabel="Войти" />],
    [
      "2FA: подтверждение паролем (name=proof)",
      () => <StartSetup status={{ proof: "password", maskedPhone: null }} onStarted={() => {}} />,
    ],
    ["анкета регистрации (name=company и другие)", () => <BriefWizard userId="u1" initial={{ name: "" }} needsPhone needsEmail />],
    [
      "правка кандидата",
      () => <CandidateEditForm candidateId="c1" initialValues={{ fullName: "Анна Смирнова" }} restricted={false} backHref="/a/candidates" />,
    ],
    [
      "правка брифа вакансии",
      () => <BriefEditForm vacancyId="v1" initialValues={{ title: "Менеджер" }} hiringManagers={[]} backHref="/a/vacancies" />,
    ],
  ];

  it.each(forms)("%s", (_name, element) => {
    const [tag] = formTags(renderToString(element()));
    expect(tag, "в разметке нет <form>").toBeDefined();
    expect(attr(tag, "method")?.toLowerCase(), `форма отправилась бы GET: ${tag}`).toBe("post");
    expect(attr(tag, "action")).toBe(NO_SCRIPT_FORM_PATH);
  });

  it("контроль: форма с onSubmit без action, какими они были, — без method, то есть GET (это и ловит тест)", () => {
    function Legacy() {
      return (
        <form onSubmit={(e) => e.preventDefault()}>
          <input name="proof" type="password" />
        </form>
      );
    }
    const [tag] = formTags(renderToString(<Legacy />));
    expect(attr(tag, "method")).toBeUndefined();
    expect(attr(tag, "action")).toBeUndefined();
  });
});

describe("форма над FormData отправляется серверному действию как POST", () => {
  const forms: Array<[string, () => React.ReactElement]> = [
    ["загрузка подписанного договора (клиент)", () => <ContractUpload />],
    ["шаблон договора (агентство)", () => <ContractTemplateManager current={null} />],
  ];

  it.each(forms)("%s", (_name, element) => {
    const [tag] = formTags(renderToString(element()));
    expect(tag, "в разметке нет <form>").toBeDefined();
    expect(attr(tag, "method")?.toLowerCase(), `форма отправилась бы GET: ${tag}`).toBe("post");
    // Файл едет телом запроса: без multipart сервер не получил бы его вовсе
    expect(attr(tag, "enctype")?.toLowerCase()).toBe("multipart/form-data");
  });
});

describe("поиск — настоящий GET: запрос в адресе и есть результат", () => {
  it.each([
    ["агентство", "/a"],
    ["клиент", ""],
  ])("%s: без скриптов форма ведёт на страницу поиска с ?q=", (_who, base) => {
    const html = renderToString(<GlobalSearchField hrefBase={base} />);
    const [tag] = formTags(html);
    expect(attr(tag, "method")?.toLowerCase()).toBe("get");
    expect(attr(tag, "action")).toBe(`${base}/search`);
    // Без name поле в запрос не попадает: прежняя форма перезагружала страницу с пустым «?»
    expect(html).toMatch(/<input[^>]*\bname="q"/);
  });
});
