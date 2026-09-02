// Vacío para que las llamadas sean relativas (/api/...) y pasen por el proxy de Next.js.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface AuthUser {
  id: string;
  cedula: string;
  name: string | null;
  role: string;
  permisos?: string[] | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Ocurrió un error");
  }

  return data as T;
}

export function login(cedula: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ cedula, password }),
  });
}

export interface Vehiculo {
  id: string;
  placa: string;
  modelo: string | null;
  anio: number | null;
  horaInicioJornada: string | null;
  horaFinJornada: string | null;
  caracteristica: string | null;
  capacidad: string | null;
  capacidadReal: string | null;
  cubicaje: string | null;
  empleadores: string | null;
  flotas: string | null;
  estado: string;
  createdAt: string;
}

export interface Conductor {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string | null;
  correo: string | null;
  celular: string | null;
  perfil: string;
  depositos: string | null;
  clientes: string | null;
  activo: boolean;
  createdAt: string;
}

export interface ConductorInput {
  nombres: string;
  apellidos: string;
  cedula: string;
  correo?: string;
  celular?: string;
  perfil?: string;
  depositos?: string;
  clientes?: string;
  activo?: boolean;
}

export function getVehiculos(): Promise<Vehiculo[]> {
  return request<Vehiculo[]>("/api/vehiculos");
}

export interface VehiculoExterno extends Vehiculo {
  conductor: string | null;
  conductorDni: string | null;
}

export function getVehiculosExternos(): Promise<VehiculoExterno[]> {
  return request<VehiculoExterno[]>("/api/vehiculos/externos");
}

export function setCapacidadReal(
  placa: string,
  capacidadReal: string | null,
  cubicaje?: string | null
): Promise<{ placa: string; capacidadReal: string | null; cubicaje: string | null }> {
  return request<{ placa: string; capacidadReal: string | null; cubicaje: string | null }>(
    "/api/vehiculos/capacidad-real",
    {
      method: "PATCH",
      body: JSON.stringify({ placa, capacidadReal, cubicaje }),
    }
  );
}

export function createVehiculo(placa: string): Promise<Vehiculo> {
  return request<Vehiculo>("/api/vehiculos", {
    method: "POST",
    body: JSON.stringify({ placa }),
  });
}

export interface AppUser {
  id: string;
  cedula: string;
  name: string | null;
  role: "USER" | "ADMIN" | "DEVELOPER";
  permisos: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppUserInput {
  cedula: string;
  name: string;
  role: "USER" | "ADMIN" | "DEVELOPER";
  password?: string;
  permisos?: string[] | null;
}

export function getUsers(): Promise<AppUser[]> {
  return request<AppUser[]>("/api/users");
}

export function createUser(data: AppUserInput): Promise<AppUser> {
  return request<AppUser>("/api/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUser(id: string, data: AppUserInput): Promise<AppUser> {
  return request<AppUser>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteUser(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" });
}

export function getConductores(): Promise<Conductor[]> {
  return request<Conductor[]>("/api/conductores");
}

export function syncConductores(): Promise<{ total: number; creados: number; actualizados: number }> {
  return request<{ total: number; creados: number; actualizados: number }>("/api/conductores/sync", {
    method: "POST",
  });
}

export function createConductor(data: ConductorInput): Promise<Conductor> {
  return request<Conductor>("/api/conductores", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateConductor(
  id: string,
  data: ConductorInput
): Promise<Conductor> {
  return request<Conductor>(`/api/conductores/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function setConductorEstado(
  id: string,
  activo: boolean
): Promise<Conductor> {
  return request<Conductor>(`/api/conductores/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ activo }),
  });
}

export function deleteConductor(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/conductores/${id}`, { method: "DELETE" });
}

export interface Orden {
  id: string;
  fecha: string;
  numeroOrden: string;
  cliente: string;
  destino: string;
  producto: string;
  cantidadKg: number;
  estado: string;
  distribucion: string;
  tatOrigen: string | null;
  nit: string | null;
  codigo: string | null;
  valor: number;
  direccion: string | null;
  reenviado: boolean;
  reenviadoAt: string | null;
  asignadoVehiculo: string | null;
  cargado: boolean;
  cargadoAt: string | null;
  createdAt: string;
}

export function getOrdenes(all = false): Promise<Orden[]> {
  return request<Orden[]>(`/api/ordenes${all ? "?all=true" : ""}`);
}

export interface ClienteSinRegistrar {
  cliente: string;
  destino: string;
  nit?: string | null;
  codigo?: string | null;
  direccion?: string | null;
  distribucion?: string;
  pedidos: number;
  numeros?: string[];
  ids?: string[];
}

export interface ClienteRegistrado {
  cliente: string;
  destino: string;
  codigo: string | null;
  pedidos: number;
}

export interface VerificacionClientes {
  totalDestinos: number;
  registrados: ClienteRegistrado[];
  totalDirecciones?: number;
  sinRegistrar: ClienteSinRegistrar[];
}

export function verificarClientesOrdenes(): Promise<VerificacionClientes> {
  return request<VerificacionClientes>("/api/ordenes/verificar-clientes");
}

export function syncOrdenesTat(
  origen: "AGROPECUARIA" | "INVERSIONES"
): Promise<{ importados: number; sinCodigo?: number; origen: string }> {
  return request<{ importados: number; sinCodigo?: number; origen: string }>(
    "/api/ordenes/sync-tat",
    {
      method: "POST",
      body: JSON.stringify({ origen }),
    }
  );
}

export function deleteOrdenes(
  tipo?: "B" | "P" | "I" | "AGRO" | "TAT"
): Promise<{ eliminados: number }> {
  const qs = tipo ? `?tipo=${tipo}` : "";
  return request<{ eliminados: number }>(`/api/ordenes${qs}`, {
    method: "DELETE",
  });
}

export function eliminarOrdenesPorIds(
  ids: string[]
): Promise<{ eliminados: number }> {
  return request<{ eliminados: number }>("/api/ordenes/eliminar", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function asignarOrdenes(
  ids: string[],
  placa: string | null
): Promise<{ actualizados: number }> {
  return request<{ actualizados: number }>("/api/ordenes/asignar", {
    method: "POST",
    body: JSON.stringify({ ids, placa }),
  });
}

export function reenviarOrdenes(
  ids: string[]
): Promise<{ reenviados: number; errores: string[] }> {
  return request<{ reenviados: number; errores: string[] }>(
    "/api/ordenes/reenviar",
    { method: "POST", body: JSON.stringify({ ids }) }
  );
}

export function syncEstadoDrivin(): Promise<{ actualizados: number; escenarios: number }> {
  return request<{ actualizados: number; escenarios: number }>(
    "/api/ordenes/sync-drivin-estado",
    { method: "POST" }
  );
}

export interface Cliente {
  id: string;
  codigoDireccion: string | null;
  nombreDireccion: string | null;
  cliente: string | null;
  tipoDireccion: string | null;
  direccion: string | null;
  referencia: string | null;
  descripcion: string | null;
  comuna: string | null;
  provincia: string | null;
  region: string | null;
  pais: string | null;
  codigoPostal: string | null;
  lat: string | null;
  lon: string | null;
  barrio: string | null;
  telefono: string | null;
  correo: string | null;
  puntoVenta: string | null;
  tipo: string | null;
  activo: boolean;
  consecutivos: string[];
  createdAt: string;
}

export function getClientes(): Promise<Cliente[]> {
  return request<Cliente[]>("/api/clientes");
}

export type ClienteInput = Partial<Omit<Cliente, "id" | "createdAt">>;

export function updateCliente(
  id: string,
  data: ClienteInput
): Promise<Cliente> {
  return request<Cliente>(`/api/clientes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function crearCliente(data: ClienteInput): Promise<Cliente> {
  return request<Cliente>("/api/clientes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function asignarConsecutivo(
  id: string,
  consecutivo: string
): Promise<Cliente> {
  return request<Cliente>(`/api/clientes/${id}/consecutivo`, {
    method: "POST",
    body: JSON.stringify({ consecutivo }),
  });
}

export function cruzarConsecutivosAuto(): Promise<{
  asignados: number;
  clientesAfectados: number;
}> {
  return request("/api/clientes/auto-consecutivos", { method: "POST" });
}

export async function importClientes(
  file: File
): Promise<{ importados: number }> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/clientes/import`, {
      method: "POST",
      headers: { ...authHeader() },
      body: form,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Error al importar");
  }
  return data as { importados: number };
}

export interface ClienteTat {
  id: string;
  codigoTercero: string | null;
  nit: string | null;
  razonSocial: string | null;
  sucursal: string | null;
  descripcionSucursal: string | null;
  direccion1: string | null;
  barrio: string | null;
  ciudad: string | null;
  departamento: string | null;
  pais: string | null;
  telefono: string | null;
  celular: string | null;
  correo: string | null;
  idVendedor: string | null;
  vendedor: string | null;
  idCriterio: string | null;
  criterio: string | null;
  referencia: string | null;
  lat: string | null;
  lon: string | null;
  puntoVenta: string | null;
  tipo: string | null;
  consecutivos?: string[];
  editado: boolean;
  editadoAt: string | null;
  createdAt: string;
}

export type ClienteTatInput = Omit<
  ClienteTat,
  "id" | "editado" | "editadoAt" | "createdAt"
>;

export function getClientesTat(): Promise<ClienteTat[]> {
  return request<ClienteTat[]>("/api/clientes-tat");
}

export function syncClientesTat(): Promise<{
  sincronizados: number;
  creados: number;
  actualizados: number;
  preservados: number;
}> {
  return request("/api/clientes-tat/sync", { method: "POST" });
}

export function updateClienteTat(
  id: string,
  data: ClienteTatInput
): Promise<ClienteTat> {
  return request<ClienteTat>(`/api/clientes-tat/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteClienteTat(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/clientes-tat/${id}`, {
    method: "DELETE",
  });
}

export function asignarConsecutivoTat(
  id: string,
  consecutivo: string
): Promise<ClienteTat> {
  return request<ClienteTat>(`/api/clientes-tat/${id}/consecutivo`, {
    method: "POST",
    body: JSON.stringify({ consecutivo }),
  });
}

export interface Plan {
  token: string;
  deploy_date: string;
  description: string;
  status: string;
  schema_name: string;
  schema_code: string;
  created_at: string;
}

export interface PlanInput {
  descripcion: string;
  fecha: string;
  schemaName: string;
  fleetName?: string;
  placas?: string[];
}

export interface PlanMeta {
  vehiculos: number;
  direcciones: number;
  ordenes: number;
  nuevas?: number;
  duplicadas?: number;
  existentes?: number;
  descripcion?: string;
  mensaje?: string;
  scenarioToken?: string;
  estado?: string;
  added?: number;
  skipped?: number;
}

export function getPlanes(date: string): Promise<Plan[]> {
  return request<Plan[]>(`/api/planes?date=${date}`);
}

export function getSchemas(): Promise<string[]> {
  return request<string[]>("/api/planes/schemas");
}

export function getFlotas(): Promise<string[]> {
  return request<string[]>("/api/planes/flotas");
}

export function crearPlan(
  data: PlanInput
): Promise<{ _meta: PlanMeta; [key: string]: unknown }> {
  return request<{ _meta: PlanMeta; [key: string]: unknown }>("/api/planes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function agregarAPlan(
  scenarioToken: string
): Promise<{ _meta: PlanMeta; [key: string]: unknown }> {
  return request<{ _meta: PlanMeta; [key: string]: unknown }>(
    "/api/planes/agregar",
    { method: "POST", body: JSON.stringify({ scenarioToken }) }
  );
}

export async function importOrdenes(
  file: File,
  tipo: "B" | "P" | "I"
): Promise<{
  importados: number;
  entregados: number;
  rechazados: number;
  pendientes: number;
  sinCodigo?: number;
}> {
  const form = new FormData();
  form.append("tipo", tipo);
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/ordenes/import`, {
      method: "POST",
      headers: { ...authHeader() },
      body: form,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Error al importar");
  }
  return data as {
    importados: number;
    entregados: number;
    rechazados: number;
    pendientes: number;
    sinCodigo?: number;
  };
}

const TOKEN_KEY = "drivin_tat_token";
const USER_KEY = "drivin_tat_user";

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Planillas de despacho ──────────────────────────────────────────────────
export interface PlanillaItem {
  numeroOrden: string;
  cliente: string;
  destino: string;
  area?: string;
  codigoArea?: string;
  nombreDestino?: string;
  direccion?: string;
  kg: number;
}

export interface Planilla {
  id: string;
  consecutivo: number;
  fecha: string;
  placa: string;
  conductor: string | null;
  origen: string | null;
  horaSalida: string | null;
  auxiliarRuta: string | null;
  tipoDespacho: string | null;
  ruta: string | null;
  docs: number;
  kilos: number;
  clientes: string[];
  items: PlanillaItem[];
  anulada: boolean;
  anuladaAt: string | null;
  impresa: boolean;
  impresaAt: string | null;
  reemplazadaPorConsecutivo: number | null;
  reemplazaDeConsecutivo: number | null;
  createdAt: string;
}

export interface PlanillaInput {
  fecha: string;
  placa: string;
  conductor?: string | null;
  origen?: string | null;
  horaSalida?: string | null;
  auxiliarRuta?: string | null;
  tipoDespacho?: string | null;
  ruta?: string | null;
  docs?: number;
  kilos?: number;
  clientes?: string[];
  items?: PlanillaItem[];
}

export interface PlanillaPatch {
  placa?: string;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  ruta?: string | null;
  tipoDespacho?: string | null;
  horaSalida?: string | null;
  items?: PlanillaItem[];
  anulada?: boolean;
  impresa?: boolean;
}

export function getPlanillas(): Promise<Planilla[]> {
  return request<Planilla[]>("/api/planillas");
}

export function crearPlanilla(data: PlanillaInput): Promise<Planilla> {
  return request<Planilla>("/api/planillas", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function editarPlanilla(id: string, data: PlanillaPatch): Promise<Planilla> {
  return request<Planilla>(`/api/planillas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function eliminarPlanilla(id: string): Promise<{ eliminado: boolean }> {
  return request<{ eliminado: boolean }>(`/api/planillas/${id}`, {
    method: "DELETE",
  });
}

export interface AnularPlanillaOverride {
  placa?: string;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  ruta?: string | null;
  tipoDespacho?: string | null;
  items?: PlanillaItem[];
  clientes?: string[];
}

export function anularPlanilla(
  id: string,
  override?: AnularPlanillaOverride
): Promise<{ anulada: Planilla; nueva: Planilla }> {
  return request<{ anulada: Planilla; nueva: Planilla }>(`/api/planillas/${id}/anular`, {
    method: "POST",
    body: JSON.stringify(override ?? {}),
  });
}

export function marcarImpresa(id: string): Promise<Planilla> {
  return editarPlanilla(id, { impresa: true });
}

// ── Novedades (nivel de servicio) ──────────────────────────────────────────
export type NovedadEstado = "Pendiente" | "En tramitación" | "Resuelto" | "Cerrada";
export type NovedadPrioridad = "Alta" | "Media" | "Baja";
export type NivelEstado = "Sin Novedad" | "Con Novedad" | "Doc.Pendiente" | "Reenvio" | "Rechazado" | "Parcial Con Novedad";

export interface Novedad {
  id: string;
  consecutivo: number;
  fecha: string;
  tipo: string;
  prioridad: NovedadPrioridad;
  estado: NovedadEstado;
  estadoEntrega: NivelEstado;
  novedad: string | null;
  responsabilidad: string | null;
  noLlego: string | null;
  planillaId: string | null;
  placa: string | null;
  conductor: string | null;
  auxiliarRuta: string | null;
  cliente: string | null;
  numeroOrden: string | null;
  descripcion: string;
  resolucion: string | null;
  resueltaAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NovedadInput = {
  fecha?: string;
  tipo?: string;
  prioridad?: NovedadPrioridad;
  estado?: NovedadEstado;
  estadoEntrega?: NivelEstado;
  novedad?: string | null;
  responsabilidad?: string | null;
  noLlego?: string | null;
  planillaId?: string | null;
  placa?: string | null;
  conductor?: string | null;
  auxiliarRuta?: string | null;
  cliente?: string | null;
  numeroOrden?: string | null;
  descripcion?: string;
  resolucion?: string | null;
};

export function getNovedades(): Promise<Novedad[]> {
  return request<Novedad[]>("/api/novedades");
}

export function crearNovedad(data: NovedadInput): Promise<Novedad> {
  return request<Novedad>("/api/novedades", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function editarNovedad(id: string, data: Partial<NovedadInput>): Promise<Novedad> {
  return request<Novedad>(`/api/novedades/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function eliminarNovedad(id: string): Promise<{ eliminado: boolean }> {
  return request<{ eliminado: boolean }>(`/api/novedades/${id}`, {
    method: "DELETE",
  });
}

// ── Configuración (auxiliares, rutas, nombres de planes, cambios) ───────────
export interface Auxiliar {
  id: string;
  nombre: string;
  telefono?: string | null;
  orden?: number;
}

export interface Ruta {
  id: string;
  nombre: string;
  recorrido?: string | null;
  ciudad?: string | null;
  kls?: number | null;
  tiempo?: string | null;
  grupo?: string | null;
  orden?: number;
}

export interface PlanNombre {
  id: string;
  nombre: string;
  tipo?: string | null;
  orden?: number;
}

export function getAuxiliares(): Promise<Auxiliar[]> {
  return request<Auxiliar[]>("/api/config/auxiliares");
}

export function saveAuxiliares(data: Auxiliar[]): Promise<Auxiliar[]> {
  return request<Auxiliar[]>("/api/config/auxiliares", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getRutas(): Promise<Ruta[]> {
  return request<Ruta[]>("/api/config/rutas");
}

export function saveRutas(data: Ruta[]): Promise<Ruta[]> {
  return request<Ruta[]>("/api/config/rutas", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getPlanNombres(): Promise<PlanNombre[]> {
  return request<PlanNombre[]>("/api/config/plan-nombres");
}

export function savePlanNombres(data: PlanNombre[]): Promise<PlanNombre[]> {
  return request<PlanNombre[]>("/api/config/plan-nombres", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export type TipoCambio = "movimiento" | "anulacion" | "reimpresion" | "liberacion";

export interface CambioDespacho {
  id: string;
  tipo: TipoCambio;
  remision?: string | null;
  deVehiculo?: string | null;
  aVehiculo?: string | null;
  dlOrigen?: number | null;
  dlNuevo?: number | null;
  detalle?: string | null;
  hecho: boolean;
  createdAt: string;
}

export type CambioInput = {
  tipo: TipoCambio;
  remision?: string | null;
  deVehiculo?: string | null;
  aVehiculo?: string | null;
  dlOrigen?: number | null;
  dlNuevo?: number | null;
  detalle?: string | null;
};

export function getCambios(): Promise<CambioDespacho[]> {
  return request<CambioDespacho[]>("/api/config/cambios");
}

export function addCambio(data: CambioInput): Promise<CambioDespacho> {
  return request<CambioDespacho>("/api/config/cambios", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function marcarCambioHecho(id: string, hecho: boolean): Promise<CambioDespacho> {
  return request<CambioDespacho>(`/api/config/cambios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ hecho }),
  });
}

export function limpiarCambiosHechos(): Promise<{ eliminados: number }> {
  return request<{ eliminados: number }>("/api/config/cambios/hechos", {
    method: "DELETE",
  });
}

// ── Resumen de órdenes (dashboard) ──────────────────────────────────────────
export interface OrdenesResumen {
  totalOrdenes: number;
  vivas: number;
  asignadas: number;
  sinAsig: number;
  enviadas: number;
  entregadas: number;
  rechazadas: number;
  reenviadas: number;
  kilosVivas: number;
  kilosEnviadas: number;
  tat: number;
  agro: number;
  vehiculosConCarga: number;
}

export function getResumen(): Promise<OrdenesResumen> {
  return request<OrdenesResumen>("/api/ordenes/resumen");
}
