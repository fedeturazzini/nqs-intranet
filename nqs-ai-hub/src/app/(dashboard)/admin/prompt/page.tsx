/**
 * /admin/prompt — ruta vieja. El "Prompt Padre" se renombró a "System
 * Brain" y vive en /admin/brain (protegido por password). Redirigimos.
 */
import { redirect } from "next/navigation";

export default function AdminPromptRedirect() {
  redirect("/admin/brain");
}
