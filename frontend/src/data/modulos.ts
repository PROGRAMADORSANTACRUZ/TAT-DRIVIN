// Módulos del sistema para permisos granulares de usuario.
// La clave es el href base de cada módulo (lo que usa el Sidebar).

export interface Modulo {
  key: string;
  label: string;
  grupo: "Operación" | "Configuración";
}

export const MODULOS: Modulo[] = [
  { key: "/dashboard", label: "Dashboard", grupo: "Operación" },
  { key: "/ordenes", label: "Cargar Órdenes", grupo: "Operación" },
  { key: "/asignacion-vehiculos", label: "Asignación de órdenes", grupo: "Operación" },
  { key: "/planes", label: "Diagrama", grupo: "Operación" },
  { key: "/planificacion-dl", label: "Planificación D.L.", grupo: "Operación" },
  { key: "/historicos", label: "Históricos", grupo: "Operación" },
  { key: "/nivel-de-servicio", label: "Nivel de servicio", grupo: "Operación" },
  { key: "/configuracion/clientes", label: "Clientes", grupo: "Operación" },
  { key: "/configuracion/vehiculos", label: "Vehículos", grupo: "Configuración" },
  { key: "/configuracion/rutas", label: "Rutas", grupo: "Configuración" },
  { key: "/configuracion/conductores", label: "Conductores", grupo: "Configuración" },
  { key: "/configuracion/usuarios", label: "Usuarios", grupo: "Configuración" },
  { key: "/configuracion/plan-nombres", label: "Nombres de planes", grupo: "Configuración" },
];

export const TODOS_LOS_MODULOS = MODULOS.map((m) => m.key);

// ¿El usuario puede acceder al módulo? ADMIN/DEVELOPER o permisos null/undefined = todos.
export function puedeAcceder(
  href: string,
  role?: string,
  permisos?: string[] | null
): boolean {
  if (role === "ADMIN" || role === "DEVELOPER") return true;
  if (!permisos) return true; // sin restricción configurada
  // Coincide por prefijo de módulo (p. ej. /nivel-de-servicio/tat → /nivel-de-servicio)
  return permisos.some((p) => href === p || href.startsWith(p + "/"));
}
