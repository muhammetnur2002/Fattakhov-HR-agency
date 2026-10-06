import { redirect } from "next/navigation";

/**
 * Прежний адрес регистрации компании. На него ведёт кнопка «Я работодатель»
 * студенческой платформы (её components/screens/Landing.tsx и LoginForm.tsx),
 * поэтому адрес живёт: регистрация теперь одна, /register, а почта — одна
 * из её вкладок, та же форма, что была здесь.
 */
export default function CompanyRegisterPage() {
  redirect("/register?method=email");
}
