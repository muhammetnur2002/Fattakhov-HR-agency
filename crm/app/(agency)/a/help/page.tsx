import type { Metadata } from "next";

import { GuideList } from "@/components/help/guide-list";
import { requireAgencyActor } from "@/lib/auth/session";
import { guideFor } from "@/lib/help/guide";
import { ROLE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Помощь" };

/**
 * Помощь для агентства. Содержимое зависит от роли смотрящего: роль
 * берётся из актора, а не из параметра адреса — иначе помощь можно было
 * бы открыть «чужими глазами», а она описывает в том числе то, что
 * человеку недоступно.
 */
export default async function AgencyHelpPage() {
  const actor = await requireAgencyActor();
  const guide = guideFor(actor.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Помощь</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{guide.intro}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Показано для роли «{ROLE_LABELS[actor.role]}».
        </p>
      </div>

      {guide.sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-medium">{section.title}</h2>
          <GuideList items={section.items} />
        </section>
      ))}
    </div>
  );
}
