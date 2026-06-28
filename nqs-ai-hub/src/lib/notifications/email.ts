/**
 * Envío de emails con Resend (S18).
 *
 * Opción B del feedback: el código queda listo y la API key se carga
 * después en `RESEND_API_KEY`. Si la key NO está, `sendEmail` hace log y
 * no rompe — el sistema funciona igual, solo no manda mails.
 *
 * ⚠️ FROM_EMAIL: ajustar a una dirección del dominio verificado en Resend.
 * Mientras no haya dominio propio verificado, Resend solo deja mandar desde
 * `onboarding@resend.dev` (sirve para test, no para producción real).
 *
 * Server-only.
 */
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "NQS AI Hub <noreply@nqs.com.ar>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    console.log(
      JSON.stringify({ level: "info", msg: "[EMAIL SKIPPED]", to, subject }),
    );
    return;
  }
  // Timeout explícito (8s): si la API de Resend cuelga, no queremos que el
  // await quede bloqueado indefinidamente cuando la key esté configurada.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resend.emails.send({ from: FROM_EMAIL, to, subject, html }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("resend_timeout")), 8_000);
      }),
    ]);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "[EMAIL ERROR]",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    // No rompe la operación principal.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Email de bienvenida con las credenciales del nuevo usuario. */
export async function sendWelcomeEmail({
  to,
  userName,
  temporaryPassword,
  hubUrl,
}: {
  to: string;
  userName: string;
  temporaryPassword: string;
  hubUrl: string;
}): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #0a0908;">¡Bienvenido a NQS AI Hub, ${userName}!</h1>
      <p>Te creamos una cuenta en NQS AI Hub. Acá están tus credenciales:</p>
      <div style="background: #f5f1e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Contraseña temporal:</strong> ${temporaryPassword}</p>
      </div>
      <p>Por seguridad, cambiala apenas entres por primera vez.</p>
      <a href="${hubUrl}" style="display: inline-block; background: #ffcb5c;
         color: #0a0908; padding: 12px 24px; border-radius: 8px;
         text-decoration: none; font-weight: bold;">
        Ingresar al hub
      </a>
      <p style="margin-top: 40px; color: #666; font-size: 12px;">
        Este email fue enviado automáticamente por NQS AI Hub.
      </p>
    </div>
  `;
  await sendEmail({ to, subject: "Bienvenido a NQS AI Hub", html });
}
