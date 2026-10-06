// @vitest-environment jsdom
/**
 * Карточка «Статус „в сети“» в настройках.
 *
 * Скрыть статус может только владелец агентства: у него в карточке есть
 * переключатель. У сотрудников агентства и клиентов переключателя нет —
 * только пояснение, что статус виден всем собеседникам.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/profile", () => ({ savePresenceAction: vi.fn() }));

import { PresenceCard } from "@/components/settings/presence-card";

describe("карточка «Статус «в сети»» в настройках", () => {
  it("владелец: переключатель есть и отражает сохранённое значение", () => {
    render(<PresenceCard role="OWNER" showPresence={false} />);

    const box = screen.getByLabelText(/Показывать, что я в сети/) as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
  });

  it("владелец с включённым показом: галочка стоит", () => {
    render(<PresenceCard role="OWNER" showPresence />);
    expect((screen.getByLabelText(/Показывать, что я в сети/) as HTMLInputElement).checked).toBe(true);
  });

  for (const role of ["HEAD", "RECRUITER", "ACCOUNT", "CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"]) {
    it(`${role}: переключателя нет, есть пояснение — даже если в базе сохранено «выключено»`, () => {
      render(<PresenceCard role={role} showPresence={false} />);

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.getByText("Статус «в сети» виден всем собеседникам")).toBeInTheDocument();
    });
  }
});
