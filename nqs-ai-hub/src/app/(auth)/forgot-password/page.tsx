/**
 * /forgot-password — Server Component thin wrapper.
 *
 * Renderiza el form de recuperación (client). No requiere sesión.
 */
import { ForgotPasswordScreen } from "@/components/screens/ForgotPasswordScreen";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
