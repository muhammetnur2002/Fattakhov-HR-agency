import Link from "next/link";
import { FileText } from "lucide-react";

import { ContractTemplateUpload } from "@/components/clients/contract-template-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/format-date";
import { getContractTemplate } from "@/lib/services/contract-documents";

export const metadata = { title: "Шаблон договора" };

/**
 * Шаблон договора для клиентов, которые пришли сами и договора ещё не имеют:
 * в своём разделе «Документы» они скачивают его, подписывают и присылают скан
 * или фото на проверку. Файл выкладывает агентство — текст договора здесь не
 * хранится и не придумывается.
 */
export default async function ContractTemplatePage() {
  const actor = await requireAgencyActor();
  authorize(actor, "agreement.manage", { clientId: null });

  const template = await getContractTemplate(actor.organizationId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/clients">← Клиенты</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Шаблон договора</h1>
        <p className="text-sm text-muted-foreground">
          Его скачивают клиенты без договора в разделе «Документы», подписывают и присылают вам на проверку.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сейчас у клиентов</CardTitle>
          <CardDescription>
            {template
              ? `Загружен ${formatDate(template.createdAt)} Новый файл заменит его для всех клиентов.`
              : "Шаблона нет — клиенты видят подсказку написать менеджеру."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {template && (
            <Button asChild variant="outline" size="sm">
              <a href={template.url} target="_blank" rel="noopener noreferrer">
                <FileText className="size-4" />
                {template.fileName}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{template ? "Заменить шаблон" : "Загрузить шаблон"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractTemplateUpload />
        </CardContent>
      </Card>
    </div>
  );
}
