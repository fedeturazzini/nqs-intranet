/**
 * Store global de toasts con Zustand.
 *
 * Por qué Zustand (no Context + Reducer): el toast se dispara desde
 * cualquier lugar del árbol (incluyendo handlers de Client Components
 * profundos) y se renderiza en un único `<Toast />` del layout. Con
 * Context tendríamos que rodear todo y pasar el dispatch por prop. Con
 * Zustand `useToastStore.getState().showToast(...)` desde cualquier lado.
 *
 * Solo se mantiene UN toast a la vez — si llega otro mientras hay uno
 * activo, lo reemplaza (no apilamos). Para apilar habría que cambiar el
 * shape a `Toast[]`.
 *
 * Auto-dismiss: por default 4s, configurable por toast con `durationMs`.
 * Pasar `0` deja el toast hasta que se llame `hideToast()` manualmente.
 */
import { create } from "zustand";

export type ToastPayload = {
  title: string;
  msg: string;
  /** CSS color string. Si no se pasa, usa `var(--accent)`. */
  color?: string;
  /** ms hasta auto-dismiss. 0 = no auto-dismiss. Default: 4000. */
  durationMs?: number;
};

type ToastState = {
  toast: ToastPayload | null;
  showToast: (payload: ToastPayload) => void;
  hideToast: () => void;
};

let timeoutId: ReturnType<typeof setTimeout> | null = null;

function clearAutoHide() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  showToast: (payload) => {
    clearAutoHide();
    set({ toast: payload });

    const duration = payload.durationMs ?? 4000;
    if (duration > 0) {
      timeoutId = setTimeout(() => {
        // Solo escondemos si seguimos mostrando el mismo toast — evita
        // pisar uno nuevo que entró justo en el borde del timeout.
        if (get().toast === payload) {
          set({ toast: null });
          timeoutId = null;
        }
      }, duration);
    }
  },
  hideToast: () => {
    clearAutoHide();
    set({ toast: null });
  },
}));

/**
 * Helper sin hook — útil para disparar toasts desde event handlers que
 * no quieren suscribirse al store.
 */
export function showToast(payload: ToastPayload): void {
  useToastStore.getState().showToast(payload);
}
