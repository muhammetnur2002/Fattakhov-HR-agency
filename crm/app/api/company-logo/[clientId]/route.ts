import { NextResponse } from "next/server";

import { isAgency, isClient } from "@/lib/access";
import { getActor } from "@/lib/auth/session";
import { readCompanyLogo } from "@/lib/services/company-profile";

/**
 * Логотип компании для аватарок и профиля. Видит агентство и сотрудники этой
 * же компании — это не персональные данные, но и не публичная картинка.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const actor = await getActor();
  const { clientId } = await params;
  if (!actor || !(isAgency(actor) || (isClient(actor) && actor.clientId === clientId))) {
    return new NextResponse(null, { status: 404 });
  }
  const logo = await readCompanyLogo(clientId);
  if (!logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(logo.body), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
