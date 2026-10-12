import { CabinetNotFound } from "@/components/shell/cabinet-not-found";
import { CLIENT_HOME } from "@/lib/nav";

/** 404 в кабинете клиента — внутри оболочки (меню, нижняя панель). */
export default function ClientNotFound() {
  return <CabinetNotFound homeHref={CLIENT_HOME} listHref="/vacancies" listLabel="К списку вакансий" />;
}
