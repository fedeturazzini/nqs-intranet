/**
 * Departamentos predefinidos de NQS.
 *
 * FEEDBACK NQS v2.0 (4.2 / 4.3): Chule pidió que el departamento sea un
 * dropdown con valores fijos en vez de texto libre. Se permite dejarlo
 * vacío. Si un user ya existente tiene un valor fuera de esta lista (texto
 * libre viejo), la UI lo muestra igual y permite cambiarlo a uno de estos.
 */
export const DEPARTMENTS = [
  "PARTNER",
  "AD",
  "PM",
  "3D ARTIST",
  "3D MODELING",
  "PP ARTIST",
  "IN ARTIST",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

/** True si `value` es uno de los departamentos predefinidos. */
export function isKnownDepartment(value: string | null | undefined): boolean {
  if (!value) return false;
  return (DEPARTMENTS as readonly string[]).includes(value);
}
