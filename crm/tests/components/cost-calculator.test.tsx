// @vitest-environment jsdom
/**
 * CostCalculator: считает по цифрам посетителя и ничего не выдумывает за него.
 *
 * Это единственный расчёт стоимости своей команды на сайте. Оклады агентство
 * назвать не может, поэтому поля пустые, а всё, что видно в результате, либо
 * введено человеком, либо взято из подтверждённого тарифа. Тест держит
 * именно это: пустой калькулятор не показывает суммы, а заполненный считает
 * ровно то, что ввели.
 *
 * Числа в тестах — вводимые, не заявления о рынке.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CostCalculator } from "@/components/marketing/cost-calculator";

function setup() {
  const { container } = render(<CostCalculator />);
  // Область результата: единственная с aria-live, читается вслух при пересчёте
  const result = container.querySelector('[aria-live="polite"]') as HTMLElement;

  return {
    container,
    result,
    fill: (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } }),
  };
}

const ДИРЕКТОР = "HR-директор, ₽ в месяц";
const МЕНЕДЖЕР = "HR-менеджер, ₽ в месяц";
const РЕКРУТЕР = "Рекрутер, ₽ в месяц";
const ВЗНОСЫ = "Страховые взносы, %";
const ИНСТРУМЕНТЫ = "Площадки и инструменты, ₽ в месяц";

describe("CostCalculator", () => {
  it("пустой: оклады не заполнены за человека, суммы своей команды нет", () => {
    const { result } = setup();

    for (const label of [ДИРЕКТОР, МЕНЕДЖЕР, РЕКРУТЕР, ИНСТРУМЕНТЫ]) {
      expect(screen.getByLabelText(label)).toHaveValue(null);
    }
    // Единственное заполненное поле — общий тариф взносов, и он правится
    expect(screen.getByLabelText(ВЗНОСЫ)).toHaveValue(30);

    expect(result).toHaveTextContent("впишите оклады");
    expect(result).toHaveTextContent("покажем разницу за год");
    // Цена подписки подтверждена и видна сразу: тариф по умолчанию — три вакансии
    expect(result).toHaveTextContent("175 000 ₽");
  });

  it("считает по введённым окладам: оклады, взносы и инструменты", () => {
    const { result, fill } = setup();

    fill(ДИРЕКТОР, "200000");
    fill(МЕНЕДЖЕР, "130000");
    fill(РЕКРУТЕР, "70000");
    fill(ИНСТРУМЕНТЫ, "70000");

    expect(result).toHaveTextContent("590 000 ₽");
    expect(result).toHaveTextContent(
      "оклады 400 000 + взносы 120 000 + инструменты 70 000",
    );
    // (590 000 − 175 000) × 12, и процент округлён вниз
    expect(result).toHaveTextContent("4 980 000 ₽");
    expect(result).toHaveTextContent("подписка дешевле на 70%");
  });

  it("ставка взносов правится и пересчитывает итог", () => {
    const { result, fill } = setup();

    fill(ДИРЕКТОР, "200000");
    fill(МЕНЕДЖЕР, "130000");
    fill(РЕКРУТЕР, "70000");
    fill(ВЗНОСЫ, "15");

    // Малый и средний бизнес платит меньше: 400 000 + 15% = 460 000
    expect(result).toHaveTextContent("460 000 ₽");
    expect(result).toHaveTextContent("взносы 60 000");
  });

  it("на маленьких окладах честно говорит, что своя команда дешевле", () => {
    const { result, fill } = setup();

    fill(РЕКРУТЕР, "100000");

    // 100 000 + 30% = 130 000 против 175 000 за три вакансии
    expect(result).toHaveTextContent("130 000 ₽");
    expect(result).toHaveTextContent("своя команда дешевле");
    expect(result).not.toHaveTextContent("подписка дешевле на");
  });

  it("инструменты без окладов не превращаются в «стоимость команды»", () => {
    const { result, fill } = setup();

    fill(ИНСТРУМЕНТЫ, "70000");

    expect(result).toHaveTextContent("впишите оклады");
    expect(result).not.toHaveTextContent("70 000 ₽");
  });

  it("стёртое поле — ноль, а не NaN", () => {
    const { result, fill } = setup();

    fill(ДИРЕКТОР, "200000");
    fill(ДИРЕКТОР, "");
    fill(ВЗНОСЫ, "");

    expect(result).not.toHaveTextContent("NaN");
    expect(result).toHaveTextContent("впишите оклады");
  });
});
