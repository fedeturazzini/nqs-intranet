/**
 * /reset-password — Server Component thin wrapper.
 *
 * Destino del link del mail de recuperación. El token viene en el hash y
 * lo procesa el client component (no se puede leer server-side).
 */
import { ResetPasswordScreen } from "@/components/screens/ResetPasswordScreen";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
