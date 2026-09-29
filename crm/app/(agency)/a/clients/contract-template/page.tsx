import { redirect } from "next/navigation";

/** Шаблон договора теперь живёт в настройках: замена и удаление — там же. */
export default function ContractTemplateRedirect() {
  redirect("/a/settings#contract-template");
}
