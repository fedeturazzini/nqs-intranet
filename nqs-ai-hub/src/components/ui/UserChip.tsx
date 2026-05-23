/**
 * Chip de usuario en la esquina superior derecha del topbar. Solo
 * markup — la acción de salir va en `LogoutButton` (Client) anidado.
 *
 * Adaptado de design/uploads — clases `.user-chip` y `.av`.
 */
import { LogoutButton } from "./LogoutButton";

type UserChipProps = Readonly<{
  user: {
    name: string;
    initials: string;
  };
}>;

export function UserChip({ user }: UserChipProps) {
  // Mostramos solo el primer nombre, igual que el diseño del cliente.
  const firstName = user.name.split(" ")[0];

  return (
    <div className="user-chip">
      <div className="av">{user.initials}</div>
      <span>{firstName}</span>
      <span className="dim">·</span>
      <LogoutButton
        className="dim"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        salir
      </LogoutButton>
    </div>
  );
}
