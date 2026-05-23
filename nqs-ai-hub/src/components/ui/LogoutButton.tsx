"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = Readonly<{
  className?: string;
  children?: React.ReactNode;
}>;

export function LogoutButton({
  className = "btn sm",
  children = "salir",
}: LogoutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Hard navigation para que el proxy re-evalúe cookies en limpio.
      window.location.href = "/login";
    } catch {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? "saliendo…" : children}
    </button>
  );
}
