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

/**
 * Índice para ordenar por el ORDEN DEL MENÚ (no alfabético). Los conocidos
 * van por su posición en `DEPARTMENTS`; los vacíos/desconocidos al final.
 * Lo usan la tabla de usuarios y el panel de accesos para ordenar igual.
 */
export function deptOrder(value: string | null | undefined): number {
  const v = value?.trim();
  if (!v) return DEPARTMENTS.length + 1;
  const i = (DEPARTMENTS as readonly string[]).indexOf(v);
  return i === -1 ? DEPARTMENTS.length : i;
}
