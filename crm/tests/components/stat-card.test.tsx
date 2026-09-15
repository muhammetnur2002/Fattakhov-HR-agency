// @vitest-environment jsdom
/**
 * StatRow: число колонок под фактическое число плиток.
 *
 * Часть плиток на дашборде агентства условная — `{manages && ... && (
 * <StatCard/>)}`. Когда условие не выполняется, JSX не убирает слот
 * из дерева детей, он остаётся значением `false`. Первая версия этой
 * правки считала Children.count(children) — эта функция берёт в расчёт
 * и такие несработавшие слоты тоже: для пяти видимых плиток рекрутёра
 * в дереве всегда девять слотов (пять настоящих плюс четыре условных),
 * и count вернул 9 вместо 5. 9 % 3 === 0 — вместо пяти колонок в одну
 * строку вышло три, с пустой серой ячейкой. Проверено тогда вручную,
 * отдельным скриптом на реальном React; здесь то же самое — тестом,
 * который остаётся в репозитории.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCard, StatRow } from "@/components/shell/stat-card";

/** Пять плиток рекрутёра вперемешку с четырьмя несработавшими условиями —
 *  ровно то дерево детей, что и в app/(agency)/a/page.tsx. */
function RecruiterDashboardTiles() {
  const manages = false;
  const managesBusiness = false;

  return (
    <StatRow>
      <StatCard label="Ждут решения клиента" value={10} />
      {manages && <StatCard label="Без рекрутёра" value={0} />}
      {manages && <StatCard label="Просрочено по этапам" value={0} />}
      {managesBusiness && <StatCard label="Ждут подтверждения" value={0} />}
      {managesBusiness && <StatCard label="Просрочено" value={0} />}
      {!manages && !managesBusiness && (
        <StatCard label="Мои вакансии" value={1} />
      )}
      <StatCard label="Вакансий в работе" value={3} />
      <StatCard label="Кандидатов в воронках" value={22} />
      <StatCard label="Интервью на неделе" value={0} />
    </StatRow>
  );
}

function gridColsClass(container: HTMLElement): string {
  const row = container.querySelector('[class*="grid-cols-1"]');
  const match = row?.className.match(/lg:grid-cols-\d/);
  if (!match) throw new Error("lg:grid-cols-N не найден в className ряда");
  return match[0];
}

describe("StatRow: число колонок", () => {
  it("пять видимых плиток — пять колонок, а не три", () => {
    const { container } = render(<RecruiterDashboardTiles />);
    expect(gridColsClass(container)).toBe("lg:grid-cols-5");
  });

  it("все пять плиток реально отрисованы", () => {
    const { getByText } = render(<RecruiterDashboardTiles />);
    for (const label of [
      "Ждут решения клиента",
      "Мои вакансии",
      "Вакансий в работе",
      "Кандидатов в воронках",
      "Интервью на неделе",
    ]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it("несработавшие условия не оставляют следа в разметке", () => {
    const { queryByText } = render(<RecruiterDashboardTiles />);
    expect(queryByText("Без рекрутёра")).not.toBeInTheDocument();
    expect(queryByText("Ждут подтверждения")).not.toBeInTheDocument();
  });

  it("четыре плитки клиента — по-прежнему четыре колонки", () => {
    const { container } = render(
      <StatRow>
        <StatCard label="Активных вакансий" value={2} />
        <StatCard label="Ждут решения" value={10} />
        <StatCard label="Интервью на неделе" value={0} />
        <StatCard label="Закрыто за 90 дней" value={1} />
      </StatRow>,
    );
    expect(gridColsClass(container)).toBe("lg:grid-cols-4");
  });

  it("шесть плиток руководителя — три колонки, две ровные строки", () => {
    const manages = true;
    const { container } = render(
      <StatRow>
        <StatCard label="Ждут решения клиента" value={10} />
        {manages && <StatCard label="Без рекрутёра" value={2} />}
        {manages && <StatCard label="Просрочено по этапам" value={1} />}
        <StatCard label="Вакансий в работе" value={3} />
        <StatCard label="Кандидатов в воронках" value={22} />
        <StatCard label="Интервью на неделе" value={0} />
      </StatRow>,
    );
    expect(gridColsClass(container)).toBe("lg:grid-cols-3");
  });

  it("восемь плиток владельца — четыре колонки, две ровные строки", () => {
    const manages = true;
    const managesBusiness = true;
    const { container } = render(
      <StatRow>
        <StatCard label="Ждут решения клиента" value={10} />
        {manages && <StatCard label="Без рекрутёра" value={2} />}
        {manages && <StatCard label="Просрочено по этапам" value={1} />}
        {managesBusiness && <StatCard label="Ждут подтверждения" value={1} />}
        {managesBusiness && <StatCard label="Просрочено" value={0} />}
        <StatCard label="Вакансий в работе" value={3} />
        <StatCard label="Кандидатов в воронках" value={22} />
        <StatCard label="Интервью на неделе" value={0} />
      </StatRow>,
    );
    expect(gridColsClass(container)).toBe("lg:grid-cols-4");
  });
});

describe("StatCard", () => {
  it("клик по плитке со ссылкой ведёт по href", () => {
    const { getByRole } = render(
      <StatCard label="Ждут решения клиента" value={10} href="/a/candidates" />,
    );
    expect(getByRole("link")).toHaveAttribute("href", "/a/candidates");
  });

  it("без href — не ссылка, а обычный блок", () => {
    const { queryByRole } = render(
      <StatCard label="Кандидатов в воронках" value={22} />,
    );
    expect(queryByRole("link")).not.toBeInTheDocument();
  });

  it("засечка accent появляется только при значении больше нуля", () => {
    // Ноль ждущих решения — хорошая новость, а не повод привлекать
    // внимание: см. комментарий в самом компоненте
    const { container: withZero } = render(
      <StatCard label="Ждут решения клиента" value={0} accent />,
    );
    expect(withZero.querySelector(".before\\:bg-primary")).toBeNull();

    const { container: withValue } = render(
      <StatCard label="Ждут решения клиента" value={5} accent />,
    );
    expect(withValue.querySelector(".before\\:bg-primary")).not.toBeNull();
  });
});
