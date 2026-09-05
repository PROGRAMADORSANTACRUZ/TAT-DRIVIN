import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { env } from "../config/env";
import {
  fetchDrivinAddresses,
  buildAddressIndex,
  matchDrivinAddress,
  type DrivinAddress,
} from "../lib/drivinAddresses";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Normaliza encabezados: sin acentos, mayúsculas, sin espacios extra.
function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface OrdenRow {
  fecha: string;
  numeroOrden: string;
  cliente: string;
  destino: string;
  producto: string;
  cantidadKg: number;
  codigo?: string | null;
  direccion?: string | null;
  nit?: string | null;
}

// Destinos que son movimientos de planta, no órdenes: se ignoran al importar.
const DESTINOS_EXCLUIDOS = new Set([
  "DESPACHO DE M.P A PROCESO",
  "PROCESO",
  "SEBO EL CORRAL",
  "AGROSAN AGROPECUARIA SAN FERNANDO SAS",
]);

function toDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Devuelve la fecha en formato dd/mm/aaaa a partir de un Date o texto.
function formatFecha(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDMY(value);
  }
  const s = String(value ?? "").trim();
  if (!s) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) {
    return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : toDMY(d);
}

// Extrae solo los campos señalados del informe.
function parseOrdenes(buffer: Buffer): OrdenRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => norm(c).includes("ORDEN")) &&
      r.some((c) => norm(c).includes("CLIENTE"))
  );
  if (headerIdx === -1) {
    throw new HttpError(
      400,
      "No se encontraron las columnas esperadas en el archivo"
    );
  }

  const header = rows[headerIdx].map(norm);
  const col = {
    fecha: header.findIndex((h) => h.includes("FECHA")),
    numeroOrden: header.findIndex((h) => h.includes("ORDEN")),
    cliente: header.findIndex((h) => h.includes("CLIENTE")),
    destino: header.findIndex((h) => h.includes("DESTINO")),
    direccion: header.findIndex((h) => h.includes("DIRECC")),
    codigo: header.findIndex((h) => h === "CODIGO" || h.includes("CODIGO")),
    producto: header.findIndex((h) => h.includes("PRODUCTO")),
    cantidad: header.findIndex((h) => h.includes("CANT") && h.includes("KG")),
  };

  const pick = (r: unknown[], i: number) =>
    i >= 0 ? String(r[i] ?? "").trim() : "";

  const out: OrdenRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const numeroOrden = pick(r, col.numeroOrden);
    const cliente = pick(r, col.cliente);
    if (!numeroOrden && !cliente) continue;

    const destino = pick(r, col.destino);
    if (!destino) continue;
    if (DESTINOS_EXCLUIDOS.has(norm(destino))) continue;

    const cantidadStr = pick(r, col.cantidad).replace(/,/g, ".");
    out.push({
      fecha: col.fecha >= 0 ? formatFecha(r[col.fecha]) : "",
      numeroOrden,
      cliente,
      destino,
      producto: pick(r, col.producto),
      cantidadKg: Number.parseFloat(cantidadStr) || 0,
      codigo: pick(r, col.codigo) || null,
      direccion: pick(r, col.direccion) || null,
    });
  }
  return out;
}

// Parser para el formato de Inversiones (columnas: Fecha, Nro documento, Razon social, Direccion 1, Desc. item, Peso en KG).
function parseOrdenesInversiones(buffer: Buffer): OrdenRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", dateNF: "dd/mm/yyyy" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  // Encuentra el header buscando "Nro documento" o "Razon social"
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => norm(c).includes("NRO") || norm(c).includes("RAZON"))
  );
  if (headerIdx === -1) {
    throw new HttpError(400, "No se encontraron las columnas esperadas en el archivo de Inversiones");
  }

  const header = rows[headerIdx].map(norm);
  const col = {
    fecha: header.findIndex((h) => h.includes("FECHA")),
    numeroOrden: header.findIndex((h) => h.includes("NRO") && h.includes("DOC")),
    nit: header.findIndex((h) => h.includes("CLIENTE") && h.includes("FACTURA")),
    cliente: header.findIndex((h) => h.includes("RAZON") && h.includes("SOCIAL")),
    direccion: header.findIndex((h) => h.includes("DIRECC")),
    producto: header.findIndex((h) => h.includes("DESC") || h.includes("ITEM")),
    cantidad: header.findIndex((h) => h.includes("PESO") || (h.includes("KG") && !h.includes("CANT"))),
  };

  const pick = (r: unknown[], i: number) =>
    i >= 0 ? String(r[i] ?? "").trim() : "";

  // Convierte formato americano m/d/yyyy a dd/mm/yyyy.
  const parseFechaInversiones = (v: string): string => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if (m) {
      return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]}`;
    }
    return formatFecha(v);
  };

  const out: OrdenRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const numeroOrden = pick(r, col.numeroOrden);
    const cliente = pick(r, col.cliente);
    if (!numeroOrden && !cliente) continue;

    // El "destino" en Inversiones es el NIT del cliente (agrupación y cruce PODs).
    const destino = pick(r, col.nit);
    if (!destino) continue;

    const cantidadStr = pick(r, col.cantidad).replace(/,/g, ".");
    out.push({
      fecha: col.fecha >= 0 ? parseFechaInversiones(pick(r, col.fecha)) : "",
      numeroOrden,
      cliente,
      destino,
      producto: pick(r, col.producto),
      cantidadKg: Number.parseFloat(cantidadStr) || 0,
      nit: pick(r, col.nit) || null,
      direccion: pick(r, col.direccion) || null,
    });
  }
  return out;
}

// Código normalizado "CLIENTE-DESTINO" para cruzar con los PODs de Drivin.
function normCodigo(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function ddmmyyyyToISO(f: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function isoToDDMMYYYY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// Normaliza la fecha de la factura a DD/MM/YYYY tolerando formatos con hora o ya
// en DD/MM/YYYY. Si no viene o no se puede leer, usa el fecFac del QR (YYYY-MM-DD).
function fechaFacturaADMY(raw: unknown, fallbackISO: string): string {
  const s = String(raw ?? "").trim();
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return isoToDDMMYYYY(iso);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return isoToDDMMYYYY(fallbackISO);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface PodItem {
  attributes?: {
    alt_code?: string | null;
    code?: string | null;
    status?: string | null;
    scenario_token?: string | null;
    delivered_by?: string | null;
    pod_lat?: number | null;
    pod_lng?: number | null;
    reason?: string | null;
    reason_code?: string | null;
  };
}

interface PodMeta {
  status: string;
  podCode: string | null;
  scenarioToken: string | null;
  deliveredBy: string | null;
  podLat: number | null;
  podLng: number | null;
  reasonName: string | null;
  reasonCode: string | null;
}

// Consulta los PODs de Drivin y devuelve un mapa código -> metadatos.
async function fetchPodEstados(
  startISO: string,
  endISO: string
): Promise<Map<string, PodMeta>> {
  const map = new Map<string, PodMeta>();
  if (!env.DRIVIN_API_KEY) return map;

  const url = `${env.DRIVIN_API_URL}/v3/pods?start_date=${startISO}&end_date=${endISO}`;
  const resp = await fetch(url, {
    headers: { "X-API-Key": env.DRIVIN_API_KEY },
  });
  if (!resp.ok) return map;

  const json = (await resp.json()) as { data?: PodItem[] };
  for (const item of json.data ?? []) {
    const a = item.attributes ?? {};
    // Se cruza por el código de la orden (a.code = numeroOrden), que es único
    // por orden. El alt_code (cliente-destino) se repite entre entregas y
    // marcaba órdenes nuevas como entregadas por error.
    if (!a.code) continue;
    map.set(normCodigo(a.code), {
      status: (a.status ?? "").toLowerCase(),
      podCode: a.code ?? null,
      scenarioToken: a.scenario_token ?? null,
      deliveredBy: a.delivered_by ?? null,
      podLat: a.pod_lat ?? null,
      podLng: a.pod_lng ?? null,
      reasonName: a.reason ?? null,
      reasonCode: a.reason_code ?? null,
    });
  }
  return map;
}

// Traduce el status del POD al estado interno de la orden.
function estadoDesdePod(status: string | undefined): string {
  switch (status) {
    case "approved":
      return "Entregado";
    case "partial":
      return "Parcial";
    case "rejected":
      return "Rechazado";
    default:
      return "Pendiente";
  }
}

interface Escenario {
  token: string;
  description: string;
}

// Consulta los planes/escenarios de Drivin para una fecha (aaaa-mm-dd).
async function fetchEscenarios(dateISO: string): Promise<Escenario[]> {
  if (!env.DRIVIN_API_KEY) return [];
  const url = `${env.DRIVIN_API_URL}/v2/scenarios?date=${dateISO}`;
  const resp = await fetch(url, {
    headers: { "X-API-Key": env.DRIVIN_API_KEY },
  });
  if (!resp.ok) return [];

  const json = (await resp.json()) as {
    response?: { token?: string | null; description?: string | null }[];
  };
  return (json.response ?? [])
    .map((s) => ({ token: s.token ?? "", description: s.description ?? "" }))
    .filter((s) => s.token);
}

// Alias de cliente -> palabra clave del plan, cuando el nombre no coincide.
const ALIAS_PLAN: { patron: RegExp; keyword: string }[] = [
  { patron: /INVERCOMER/, keyword: "MEGATIENDA" },
];

// Elige el token del plan según el cliente/destino de la orden.
// - Plan con palabra distintiva (ej. "DESPACHO EXITO") si el cliente la contiene.
// - Plan "DE CASA" como predeterminado para puntos de venta (PDV).
function matchScenarioToken(
  cliente: string,
  destino: string,
  escenarios: Escenario[]
): string | null {
  let texto = norm(`${cliente} ${destino}`);
  for (const a of ALIAS_PLAN) {
    if (a.patron.test(texto)) texto += ` ${a.keyword}`;
  }

  for (const e of escenarios) {
    const kw = norm(e.description)
      .replace(/DESPACHO/g, "")
      .replace(/\bDE\b/g, "")
      .replace(/CASA/g, "")
      .trim();
    if (kw && texto.includes(kw)) return e.token;
  }

  const casa = escenarios.find((e) => norm(e.description).includes("CASA"));
  if (casa) return casa.token;

  return escenarios[0]?.token ?? null;
}

// GET /api/ordenes
router.get("/", requireAuth, async (req, res, next) => {
  try {
    // ?all=true devuelve todas; por defecto solo activas (excluye Entregado/Rechazado)
    // para reducir payload en el cliente (el sistema solo necesita las activas)
    const todas = req.query.all === "true";
    const [ordenes, clientesGS, clientesTat, tatConConsec] = await Promise.all([
      prisma.orden.findMany({
        where: todas ? undefined : { estado: { notIn: ["Entregado", "Rechazado"] } },
        orderBy: [{ cliente: "asc" }, { destino: "asc" }, { numeroOrden: "asc" }],
      }),
      prisma.cliente.findMany({
        select: { cliente: true, direccion: true, codigoDireccion: true, consecutivos: true },
      }),
      prisma.clienteTat.findMany({
        where: { eliminado: false, editado: true, nit: { not: null } },
        select: { nit: true, sucursal: true, direccion1: true, razonSocial: true },
      }),
      prisma.clienteTat.findMany({
        where: { eliminado: false, consecutivos: { not: null } },
        select: { codigoTercero: true, razonSocial: true, direccion1: true, consecutivos: true },
      }),
    ]);

    // Datos actuales del maestro GS por consecutivo y por código (fuente de verdad editable).
    type MaestroInfo = { nombre?: string; direccion?: string; codigo?: string };
    const gsPorConsecutivo = new Map<string, MaestroInfo>();
    const gsPorCodigo = new Map<string, MaestroInfo>();
    // Ruteo explícito: NIT-sucursal agregado como concatenado en OTRO cliente destino.
    const porNitConcat = new Map<string, MaestroInfo>();
    const indexarConcatNit = (consecutivos: string | null, info: MaestroInfo) => {
      if (!consecutivos) return;
      try {
        for (const con of JSON.parse(consecutivos) as string[]) {
          const k = claveCliente(con);
          if (esConcatNit(k) && !porNitConcat.has(k)) porNitConcat.set(k, info);
        }
      } catch { /* consecutivos inválidos */ }
    };
    for (const c of clientesGS) {
      const dir = (c.direccion ?? "").trim();
      const nombre = (c.cliente ?? "").trim();
      const info: MaestroInfo = {};
      if (dir) info.direccion = dir;
      if (nombre) info.nombre = nombre;
      if (c.codigoDireccion) info.codigo = c.codigoDireccion.trim();
      if (!info.direccion && !info.nombre) continue;
      if (c.codigoDireccion && !gsPorCodigo.has(c.codigoDireccion.trim())) {
        gsPorCodigo.set(c.codigoDireccion.trim(), info);
      }
      indexarConcatNit(c.consecutivos, info);
      if (c.consecutivos) {
        try {
          for (const con of JSON.parse(c.consecutivos) as string[]) {
            const k = claveCliente(con);
            if (k && !gsPorConsecutivo.has(k)) gsPorConsecutivo.set(k, info);
          }
        } catch { /* consecutivos inválidos */ }
      }
    }
    for (const c of tatConConsec) {
      const info: MaestroInfo = {};
      const dir = (c.direccion1 ?? "").trim();
      const nombre = (c.razonSocial ?? "").trim();
      if (dir.length >= 2 && !NO_DIRECCION_TAT.has(dir.toUpperCase())) info.direccion = dir;
      if (nombre) info.nombre = nombre;
      if (c.codigoTercero) info.codigo = c.codigoTercero.trim();
      indexarConcatNit(c.consecutivos, info);
    }
    // Datos del maestro TAT (solo clientes editados) por NIT-sucursal.
    const tatPorClave = new Map<string, MaestroInfo>();
    for (const c of clientesTat) {
      const nit = String(c.nit ?? "").trim();
      if (!nit) continue;
      const dir = (c.direccion1 ?? "").trim();
      const nombre = (c.razonSocial ?? "").trim();
      const info: MaestroInfo = {};
      if (dir.length >= 2 && !NO_DIRECCION_TAT.has(dir.toUpperCase())) info.direccion = dir;
      if (nombre) info.nombre = nombre;
      if (!info.direccion && !info.nombre) continue;
      const suc = parseInt(String(c.sucursal ?? "").trim(), 10);
      const key = Number.isFinite(suc) ? `${nit}-${suc}` : nit;
      if (!tatPorClave.has(key)) tatPorClave.set(key, info);
    }

    // Sobrescribe (solo para la vista) el cliente por concatenado y refresca la dirección.
    const enriquecidas = ordenes.map((o) => {
      // Cliente al que el concatenado enruta la orden: por NIT (TAT) o por
      // "cliente - destino"/"destino" (GS), agregado en OTRO cliente de la BD.
      const asignado =
        (o.nit ? porNitConcat.get(claveCliente(o.nit)) : undefined) ??
        gsPorConsecutivo.get(claveCliente(`${o.cliente} - ${o.destino}`)) ??
        gsPorConsecutivo.get(claveCliente(o.destino));
      // Dirección del maestro en tiempo real (según la fuente que aplique).
      let info: MaestroInfo | undefined;
      if (o.distribucion === "TAT") {
        info =
          (o.codigo ? gsPorCodigo.get(o.codigo) : undefined) ??
          asignado ??
          (o.nit ? tatPorClave.get(o.nit) : undefined);
      } else {
        info = asignado ?? (o.codigo ? gsPorCodigo.get(o.codigo) : undefined);
      }
      const direccion = asignado?.direccion ?? info?.direccion;
      // Solo VISTA: si el concatenado apunta a un cliente de nombre distinto, se
      // muestra ese cliente (clienteAsignado) sin tocar la identidad (cliente/consecutivo).
      const sobre =
        !!asignado?.nombre &&
        claveCliente(asignado.nombre) !== claveCliente(o.cliente);
      if (!direccion && !sobre) return o;
      return {
        ...o,
        ...(direccion ? { direccion } : {}),
        ...(sobre
          ? {
              clienteAsignado: asignado!.nombre,
              clienteOriginal: o.cliente,
              sobrescritoConcatenado: true,
              ...(asignado!.codigo ? { codigo: asignado!.codigo } : {}),
            }
          : {}),
      };
    });

    res.json(enriquecidas);
  } catch (err) {
    next(err);
  }
});

// GET /api/ordenes/resumen  -> métricas agregadas por ORDEN (numeroOrden único) para el dashboard.
// Evita enviar miles de líneas al cliente; el agregado se hace en el servidor.
router.get("/resumen", requireAuth, async (_req, res, next) => {
  try {
    const filas = await prisma.orden.findMany({
      select: { numeroOrden: true, estado: true, asignadoVehiculo: true, distribucion: true, reenviado: true, cantidadKg: true },
    });
    // Agrupa líneas por numeroOrden.
    const porOrden = new Map<string, { estado: string; asignadoVehiculo: string | null; distribucion: string; reenviado: boolean; kg: number }>();
    for (const o of filas) {
      const g = porOrden.get(o.numeroOrden);
      if (g) {
        g.kg += o.cantidadKg;
        if (o.asignadoVehiculo) g.asignadoVehiculo = o.asignadoVehiculo;
        if (o.reenviado) g.reenviado = true;
        if (o.estado === "Entregado" || o.estado === "Rechazado") g.estado = o.estado;
      } else {
        porOrden.set(o.numeroOrden, {
          estado: o.estado,
          asignadoVehiculo: o.asignadoVehiculo ?? null,
          distribucion: o.distribucion,
          reenviado: !!o.reenviado,
          kg: o.cantidadKg,
        });
      }
    }
    const ords = [...porOrden.values()];
    const vivas = ords.filter((o) => o.estado !== "Entregado" && o.estado !== "Rechazado");
    const asignadas = vivas.filter((o) => o.asignadoVehiculo);
    const enviadas = vivas.filter((o) => o.estado === "Enviado");
    const vehiculosConCarga = new Set(asignadas.map((o) => o.asignadoVehiculo)).size;

    res.json({
      totalOrdenes: ords.length,
      vivas: vivas.length,
      asignadas: asignadas.length,
      sinAsig: vivas.length - asignadas.length,
      enviadas: enviadas.length,
      entregadas: ords.filter((o) => o.estado === "Entregado").length,
      rechazadas: ords.filter((o) => o.estado === "Rechazado").length,
      reenviadas: ords.filter((o) => o.reenviado).length,
      kilosVivas: vivas.reduce((s, o) => s + o.kg, 0),
      kilosEnviadas: enviadas.reduce((s, o) => s + o.kg, 0),
      tat: vivas.filter((o) => o.distribucion === "TAT").length,
      agro: vivas.filter((o) => o.distribucion !== "TAT").length,
      vehiculosConCarga,
    });
  } catch (err) {
    next(err);
  }
});

// Clave normalizada para cruzar clientes (sin acentos, mayúsculas, sin espacios extra).
function claveCliente(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Un concatenado que es un NIT (o NIT-sucursal): sirve para enrutar órdenes TAT
// a un cliente diferente (se agregan como concatenado en el cliente destino).
function esConcatNit(k: string): boolean {
  return /^\d{5,}(?:-\d+)?$/.test(k);
}

// GET /api/ordenes/verificar-clientes
// Cruza los clientes/destinos de las órdenes pendientes contra: (1) los
// consecutivos asignados manualmente a un cliente en nuestra BD y (2) las
// direcciones registradas en Drivin (/v2/addresses). Devuelve los códigos de
// los que sí están y la lista de los que no.
router.get("/verificar-clientes", requireAuth, async (_req, res, next) => {
  try {
    const [ordenes, addresses, clientesGS] = await Promise.all([
      prisma.orden.findMany({
        where: { estado: { notIn: ["Entregado", "Rechazado"] } },
        select: { id: true, cliente: true, destino: true, numeroOrden: true, nit: true, codigo: true, direccion: true, distribucion: true },
      }),
      fetchDrivinAddresses(),
      prisma.cliente.findMany({
        select: { codigoDireccion: true, cliente: true, nombreDireccion: true, direccion: true, comuna: true, provincia: true, lat: true, lon: true, consecutivos: true },
      }),
    ]);
    // Clientes TAT con concatenados (código = codigoTercero).
    const clientesTat = await prisma.clienteTat.findMany({
      where: { eliminado: false, consecutivos: { not: null } },
      select: { codigoTercero: true, razonSocial: true, consecutivos: true },
    });
    // Clientes TAT indexados por NIT + sucursal: cada sucursal es un cliente distinto.
    const clientesTatNit = await prisma.clienteTat.findMany({
      where: { eliminado: false, nit: { not: null } },
      select: { nit: true, codigoTercero: true, sucursal: true },
    });
    // Clave = NIT-<entero de sucursal> (y NIT puro como respaldo para órdenes sin sucursal).
    const porNit = new Map<string, string | null>();
    for (const c of clientesTatNit) {
      const nit = String(c.nit ?? "").trim();
      if (!nit) continue;
      const suc = parseInt(String(c.sucursal ?? "").trim(), 10);
      const key = Number.isFinite(suc) ? `${nit}-${suc}` : nit;
      if (!porNit.has(key)) porNit.set(key, c.codigoTercero);
      if (!porNit.has(nit)) porNit.set(nit, c.codigoTercero);
    }

    // Incluye el maestro GS como direcciones: así un cliente que existe en nuestra
    // BD (con su código) resuelve aunque Drivin no lo tenga registrado.
    const gsAddresses = clientesGS
      .filter((c) => c.codigoDireccion)
      .map((c) => ({
        code: c.codigoDireccion,
        name: c.nombreDireccion,
        client: c.cliente,
        address1: c.direccion,
        city: c.comuna ?? c.provincia ?? null,
        lat: c.lat ? parseFloat(c.lat) : null,
        lng: c.lon ? parseFloat(c.lon) : null,
      }));
    const index = buildAddressIndex([...addresses, ...gsAddresses]);

    // Mapa de consecutivo (normalizado) -> código del cliente en nuestra BD.
    const porConsecutivo = new Map<string, string | null>();
    // Ruteo explícito: NIT-sucursal como concatenado en OTRO cliente destino.
    const porNitConcat = new Map<string, { code: string | null; nombre: string | null }>();
    for (const c of clientesGS) {
      if (!c.consecutivos) continue;
      let lista: string[] = [];
      try {
        lista = JSON.parse(c.consecutivos) as string[];
      } catch {
        lista = [];
      }
      for (const con of lista) {
        const k = claveCliente(con);
        if (!k) continue;
        if (esConcatNit(k)) {
          if (!porNitConcat.has(k)) porNitConcat.set(k, { code: c.codigoDireccion, nombre: c.cliente });
        } else if (!porConsecutivo.has(k)) {
          porConsecutivo.set(k, c.codigoDireccion);
        }
      }
    }
    for (const c of clientesTat) {
      if (!c.consecutivos) continue;
      let lista: string[] = [];
      try {
        lista = JSON.parse(c.consecutivos) as string[];
      } catch {
        lista = [];
      }
      for (const con of lista) {
        const k = claveCliente(con);
        if (!k) continue;
        if (esConcatNit(k)) {
          if (!porNitConcat.has(k)) porNitConcat.set(k, { code: c.codigoTercero, nombre: c.razonSocial });
        } else if (!porConsecutivo.has(k)) {
          porConsecutivo.set(k, c.codigoTercero);
        }
      }
    }

    // Agrupa por par cliente||destino.
    const grupos = new Map<
      string,
      { cliente: string; destino: string; nit: string | null; codigo: string | null; direccion: string | null; distribucion: string; pedidos: Set<string>; ids: string[] }
    >();
    for (const o of ordenes) {
      const key = `${claveCliente(o.cliente)}||${claveCliente(o.destino)}`;
      let g = grupos.get(key);
      if (!g) {
        g = { cliente: o.cliente, destino: o.destino, nit: o.nit ?? null, codigo: o.codigo ?? null, direccion: o.direccion ?? null, distribucion: o.distribucion, pedidos: new Set(), ids: [] };
        grupos.set(key, g);
      }
      if (!g.nit && o.nit) g.nit = o.nit;
      if (!g.codigo && o.codigo) g.codigo = o.codigo;
      if (!g.direccion && o.direccion) g.direccion = o.direccion;
      g.pedidos.add(o.numeroOrden);
      g.ids.push(o.id);
    }

    const sinRegistrar: {
      cliente: string;
      destino: string;
      nit: string | null;
      codigo: string | null;
      direccion: string | null;
      distribucion: string;
      pedidos: number;
      numeros: string[];
      ids: string[];
    }[] = [];
    const registrados: {
      cliente: string;
      destino: string;
      codigo: string | null;
      pedidos: number;
    }[] = [];
    for (const g of grupos.values()) {
      // El consecutivo de la orden es "cliente - destino".
      const consecutivo = claveCliente(`${g.cliente} - ${g.destino}`);
      // Ruteo explícito por NIT-concatenado (manda sobre el registro propio del TAT).
      const rut = g.nit ? porNitConcat.get(claveCliente(g.nit)) : undefined;
      // Los TAT se identifican por NIT-sucursal (g.codigo); los demás por consecutivo o dirección.
      const claveTat = g.codigo ?? g.nit ?? "";
      const codigoNit = claveTat ? porNit.get(claveTat) : undefined;
      const codigoManual =
        codigoNit ??
        porConsecutivo.get(consecutivo) ??
        porConsecutivo.get(claveCliente(g.destino));
      const match =
        rut
          ? { code: rut.code }
          : codigoNit !== undefined
          ? { code: codigoNit }
          : codigoManual
          ? { code: codigoManual }
          : matchDrivinAddress(index, g.cliente, g.destino);
      if (match) {
        registrados.push({
          cliente: g.cliente,
          destino: g.destino,
          codigo: match.code ?? null,
          pedidos: g.pedidos.size,
        });
      } else {
        sinRegistrar.push({
          cliente: g.cliente,
          destino: g.destino,
          nit: g.nit,
          codigo: g.codigo,
          direccion: g.direccion,
          distribucion: g.distribucion,
          pedidos: g.pedidos.size,
          numeros: [...g.pedidos],
          ids: g.ids,
        });
      }
    }
    sinRegistrar.sort((a, b) => b.pedidos - a.pedidos);

    res.json({
      totalDestinos: grupos.size,
      registrados,
      totalDirecciones: addresses.length,
      sinRegistrar,
    });
  } catch (err) {
    next(err);
  }
});

// Resolvedor de código de cliente (mismo criterio que /verificar-clientes):
// dado (cliente, destino, nit) devuelve el código registrado o null si no existe.
// driviOk = false cuando Drivin no respondió (para no descartar por falso negativo).
async function construirResolverCodigo(): Promise<{
  resolver: (cliente: string, destino: string, nit: string | null, codigo: string | null) => { code: string | null } | null;
  driviOk: boolean;
}> {
  let addresses: DrivinAddress[] = [];
  let driviOk = true;
  try {
    addresses = await fetchDrivinAddresses();
  } catch {
    driviOk = false;
  }
  const [clientesGS, clientesTat, clientesTatNit] = await Promise.all([
    prisma.cliente.findMany({ select: { codigoDireccion: true, cliente: true, nombreDireccion: true, direccion: true, comuna: true, provincia: true, lat: true, lon: true, consecutivos: true } }),
    prisma.clienteTat.findMany({
      where: { eliminado: false, consecutivos: { not: null } },
      select: { codigoTercero: true, consecutivos: true },
    }),
    prisma.clienteTat.findMany({
      where: { eliminado: false, nit: { not: null } },
      select: { nit: true, codigoTercero: true, sucursal: true },
    }),
  ]);

  // Incluye el maestro GS como direcciones (resuelve clientes de nuestra BD
  // aunque Drivin no los tenga registrados).
  const gsAddresses = clientesGS
    .filter((c) => c.codigoDireccion)
    .map((c) => ({
      code: c.codigoDireccion,
      name: c.nombreDireccion,
      client: c.cliente,
      address1: c.direccion,
      city: c.comuna ?? c.provincia ?? null,
      lat: c.lat ? parseFloat(c.lat) : null,
      lng: c.lon ? parseFloat(c.lon) : null,
    }));
  const index = buildAddressIndex([...addresses, ...gsAddresses]);

  const porNit = new Map<string, string | null>();
  for (const c of clientesTatNit) {
    const nit = String(c.nit ?? "").trim();
    if (!nit) continue;
    const suc = parseInt(String(c.sucursal ?? "").trim(), 10);
    const key = Number.isFinite(suc) ? `${nit}-${suc}` : nit;
    if (!porNit.has(key)) porNit.set(key, c.codigoTercero);
    if (!porNit.has(nit)) porNit.set(nit, c.codigoTercero);
  }

  const porConsecutivo = new Map<string, string | null>();
  const porNitConcat = new Map<string, string | null>();
  const indexar = (consecutivos: string | null, code: string | null) => {
    if (!consecutivos) return;
    let lista: string[] = [];
    try {
      lista = JSON.parse(consecutivos) as string[];
    } catch {
      return;
    }
    for (const con of lista) {
      const k = claveCliente(con);
      if (!k) continue;
      if (esConcatNit(k)) {
        if (!porNitConcat.has(k)) porNitConcat.set(k, code);
      } else if (!porConsecutivo.has(k)) {
        porConsecutivo.set(k, code);
      }
    }
  };
  for (const c of clientesGS) indexar(c.consecutivos, c.codigoDireccion);
  for (const c of clientesTat) indexar(c.consecutivos, c.codigoTercero);

  const resolver = (cliente: string, destino: string, nit: string | null, codigo: string | null) => {
    const rut = nit ? porNitConcat.get(claveCliente(nit)) : undefined;
    if (rut !== undefined) return { code: rut };
    const claveTat = codigo ?? nit ?? "";
    const codigoNit = claveTat ? porNit.get(claveTat) : undefined;
    if (codigoNit !== undefined) return { code: codigoNit };
    const consecutivo = claveCliente(`${cliente} - ${destino}`);
    const codigoManual =
      porConsecutivo.get(consecutivo) ?? porConsecutivo.get(claveCliente(destino));
    if (codigoManual) return { code: codigoManual };
    const m = matchDrivinAddress(index, cliente, destino);
    return m ? { code: m.code } : null;
  };

  return { resolver, driviOk };
}

// POST /api/ordenes/import  (multipart, campo "file")
router.post(
  "/import",
  requireAuth,
  requirePermiso("/ordenes"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No se recibió ningún archivo");
      }

      const tipo = String(req.body?.tipo ?? "").toUpperCase();
      if (tipo !== "B" && tipo !== "P" && tipo !== "I") {
        throw new HttpError(400, "Selecciona el tipo (Bovino, Porcino o Inversiones)");
      }

      const ordenes = (tipo === "I" ? parseOrdenesInversiones(req.file.buffer) : parseOrdenes(req.file.buffer));
      const conNumero = ordenes.filter((o) => o.numeroOrden.trim());
      // Se suben TODAS las órdenes del archivo. Las que no resuelven un código en
      // Drivin/DB quedan visibles como "Sin código" para registrarlas o asignarles
      // su consecutivo desde el panel de clientes (no se descartan al importar).
      const { resolver, driviOk } = await construirResolverCodigo();
      let sinCodigo = 0;
      if (driviOk) {
        const omitidas = new Set<string>();
        for (const o of conNumero) {
          if (!resolver(o.cliente, o.destino, o.nit ?? null, null)) omitidas.add(o.numeroOrden);
        }
        sinCodigo = omitidas.size;
      }
      const ordenesConCodigo = conNumero.map((o) => ({ ...o, numeroOrden: tipo + o.numeroOrden }));
      if (ordenesConCodigo.length === 0) {
        throw new HttpError(400, "El archivo no contiene órdenes válidas");
      }

      // Cruza con los PODs de Drivin para marcar las entregadas.
      const isoDates = ordenesConCodigo
        .map((o) => ddmmyyyyToISO(o.fecha))
        .filter(Boolean)
        .sort();
      let podEstados = new Map<string, PodMeta>();
      if (isoDates.length > 0) {
        const startISO = addDaysISO(isoDates[0], -2);
        const endISO = addDaysISO(isoDates[isoDates.length - 1], 2);
        try {
          podEstados = await fetchPodEstados(startISO, endISO);
        } catch {
          // Si Drivin falla, todas quedan como pendientes.
        }
      }

      const data = ordenesConCodigo.map((o) => {
        const pod = podEstados.get(normCodigo(o.numeroOrden));
        return {
          ...o,
          distribucion: "AGROPECUARIA",
          estado: estadoDesdePod(pod?.status),
          podCode: pod?.podCode ?? null,
          scenarioToken: pod?.scenarioToken ?? null,
          deliveredBy: pod?.deliveredBy ?? null,
          podLat: pod?.podLat ?? null,
          podLng: pod?.podLng ?? null,
          reasonName: pod?.reasonName ?? null,
          reasonCode: pod?.reasonCode ?? null,
        };
      });

      // Solo reemplaza las órdenes agropecuarias del mismo tipo (B/P/I), preservando el resto.
      await prisma.$transaction([
        prisma.orden.deleteMany({
          where: {
            distribucion: "AGROPECUARIA",
            numeroOrden: { startsWith: tipo },
          },
        }),
        prisma.orden.createMany({ data }),
      ]);

      const nEntregados = data.filter((d) => d.estado === "Entregado").length;
      const nRechazados = data.filter((d) => d.estado === "Rechazado").length;
      res.status(201).json({
        importados: data.length,
        entregados: nEntregados,
        rechazados: nRechazados,
        pendientes: data.length - nEntregados - nRechazados,
        sinCodigo,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Envía la orden reenviada a Drivin mediante el endpoint de PODs.
async function enviarPodDrivin(payload: {
  order_code: string;
  scenario_token: string;
  delivered_by?: string;
  reason_name?: string;
  reason_code?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!env.DRIVIN_API_KEY) return { ok: false, error: "Sin API key de Drivin" };

  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/pod`, {
      method: "POST",
      headers: {
        "X-API-Key": env.DRIVIN_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orders: [
          {
            order_code: payload.order_code,
            scenario_token: payload.scenario_token,
            delivered_by: payload.delivered_by ?? "",
            comment: "Reenvío de orden rechazada desde sistema TAT",
            order_status: "pending",
            reason_name: payload.reason_name ?? "",
            reason_code: payload.reason_code ?? "",
          },
        ],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, error: `Drivin ${resp.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// POST /api/ordenes/reenviar  -> reenvía órdenes rechazadas a Drivin
router.post("/reenviar", requireAuth, requirePermiso("/nivel-de-servicio"), async (req, res, next) => {
  try {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, "No se seleccionaron órdenes para reenviar");
    }

    const ordenes = await prisma.orden.findMany({
      where: {
        id: { in: ids.map(String) },
        estado: "Rechazado",
        reenviado: false,
      },
    });
    if (ordenes.length === 0) {
      throw new HttpError(400, "No hay órdenes rechazadas válidas para reenviar");
    }

    // Agrupa las líneas por pedido (mismo número + cliente + destino).
    const grupos = new Map<string, typeof ordenes>();
    for (const o of ordenes) {
      const key = `${o.numeroOrden}||${o.cliente}||${o.destino}`;
      const g = grupos.get(key);
      if (g) g.push(o);
      else grupos.set(key, [o]);
    }

    const errores: string[] = [];
    let reenviados = 0;
    const now = new Date();

    // La orden reenviada toma la fecha más reciente del despacho cargado.
    const todas = await prisma.orden.findMany({ select: { fecha: true } });
    const maxISO = todas
      .map((o) => ddmmyyyyToISO(o.fecha))
      .filter(Boolean)
      .sort()
      .pop();
    const fechaReenvio = maxISO ? isoToDDMMYYYY(maxISO) : toDMY(now);

    // Consulta los planes/escenarios de esa fecha para obtener el token.
    const escenarios = maxISO ? await fetchEscenarios(maxISO) : [];

    for (const items of grupos.values()) {
      const ref = items[0];
      const token = matchScenarioToken(ref.cliente, ref.destino, escenarios);
      if (!token) {
        errores.push(`${ref.numeroOrden}: no se encontró plan/escenario en Drivin`);
        continue;
      }

      const nuevoCodigo = `R-${ref.numeroOrden}`;
      const envio = await enviarPodDrivin({
        order_code: nuevoCodigo,
        scenario_token: token,
        delivered_by: ref.deliveredBy?.replace(/^\[Mobile\]\s*/i, "") ?? "",
        reason_name: ref.reasonName ?? "",
        reason_code: ref.reasonCode ?? "",
      });
      if (!envio.ok) {
        errores.push(`${ref.numeroOrden}: ${envio.error}`);
        continue;
      }

      // Crea el nuevo pedido (R-) y marca las líneas originales como reenviadas.
      await prisma.$transaction([
        prisma.orden.createMany({
          data: items.map((o) => ({
            fecha: fechaReenvio,
            numeroOrden: nuevoCodigo,
            cliente: o.cliente,
            destino: o.destino,
            producto: o.producto,
            cantidadKg: o.cantidadKg,
            estado: "Pendiente",
          })),
        }),
        prisma.orden.updateMany({
          where: { id: { in: items.map((o) => o.id) } },
          data: { reenviado: true, reenviadoAt: now },
        }),
      ]);
      reenviados += 1;
    }

    res.json({ reenviados, errores });
  } catch (err) {
    next(err);
  }
});

// POST /api/ordenes/asignar  -> asigna (o quita) órdenes a un vehículo
router.post("/asignar", requireAuth, requirePermiso("/asignacion-vehiculos"), async (req, res, next) => {
  try {
    const ids: unknown = req.body?.ids;
    const placa: unknown = req.body?.placa;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, "No se seleccionaron órdenes");
    }

    const { count } = await prisma.orden.updateMany({
      where: { id: { in: ids.map(String) } },
      data: { asignadoVehiculo: placa ? String(placa) : null },
    });

    res.json({ actualizados: count });
  } catch (err) {
    next(err);
  }
});

// POST /api/ordenes/sync-tat  -> trae las facturas TAT desde la API como órdenes
interface TatInvoice {
  nro_documento?: string;
  fecha_documento?: string;
  cliente_factura?: string;
  razon_social_cliente?: string;
  codigo_sucursal?: string;
  descripcion_sucursal?: string;
  direccion_sucursal?: string;
  tipo_comercial?: string;
  cantidad_inv?: number;
  valor_subtotal?: number;
  // Desglose por producto (una entrada por tipo comercial de la factura).
  productos?: {
    tipo_comercial?: string;
    cantidad_inv?: number;
    valor_subtotal?: number;
  }[];
}

// Identificador de cliente TAT por sucursal: NIT-<entero de sucursal>.
// Mismo NIT con distinta sucursal = cliente distinto (ej. "005" -> 1045679622-5).
function claveNitSucursal(nit: string, codigoSucursal: string | undefined): string {
  const suc = parseInt(String(codigoSucursal ?? "").trim(), 10);
  return Number.isFinite(suc) ? `${nit}-${suc}` : nit;
}

// Convierte "2026-08-27" (ISO) a "27/08/2026" (formato del resto de órdenes).
// (Se reutiliza el helper isoToDDMMYYYY definido arriba.)

// Cada origen TAT corresponde a una compañía distinta en la API.
const TAT_ORIGENES: Record<string, string> = {
  AGROPECUARIA: "3",
  INVERSIONES: "8",
};

// Etiquetas que aparecen en direccion1 pero no son direcciones reales.
const NO_DIRECCION_TAT = new Set([
  "BOVINO", "PORCINO", "VISCERAS", "VISCERA", "SUBPRODUCTO",
  "RES", "CERDO", "POLLO", "N/A", "NA", "-", ".", "SIN DIRECCION",
]);

// Determina si una direccion1 del maestro TAT es realmente una dirección.
function esDireccionTatValida(d: string): boolean {
  const s = d.trim().toUpperCase();
  if (s.length < 5) return false;
  if (NO_DIRECCION_TAT.has(s)) return false;
  // Una dirección real suele tener números o un indicador de vía.
  return /\d/.test(s) || /\b(CLL|CALLE|CRA|CARRERA|CR|KR|AV|AVENIDA|DIAG|DG|TRANS|TV|MZ|LOTE|LT|VIA|KM)\b/.test(s);
}


// Convierte el NumFac del QR (ej. "FEP62162") al documento de Siesa.
// Toma los dígitos tras las letras, rellena a 8 con ceros y antepone el prefijo
// según la compañía: Agropecuaria -> "1FE-", Inversiones -> "FE-".
function numFacADocumento(numFac: string, origen: string): string {
  const digitos = String(numFac ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  const pad = digitos.padStart(8, "0");
  return (origen === "INVERSIONES" ? "FE-" : "1FE-") + pad;
}

// Limpia el tipo comercial "3202 - CANUTA COMESTIBLE" -> "CANUTA COMESTIBLE".
function limpiarProductoTat(tipo: string): string {
  const s = String(tipo ?? "").trim();
  const m = /^\d+\s*-\s*(.+)$/.exec(s);
  return (m ? m[1] : s).replace(/\s+/g, " ").trim();
}

// POST /api/ordenes/factura  -> consulta UNA factura en apiconsulta (Siesa) y la
// guarda (acumula). Reemplaza el sync masivo vía SIGCOM. body: { origen, numFac, fecFac, fecFin? }
router.post("/factura", requireAuth, requirePermiso("/ordenes"), async (req, res, next) => {
  try {
    const origen = String(req.body?.origen ?? "AGROPECUARIA").toUpperCase();
    const cia = TAT_ORIGENES[origen];
    if (!cia) throw new HttpError(400, "Origen inválido (AGROPECUARIA o INVERSIONES)");

    const numFac = String(req.body?.numFac ?? "").trim();
    const fecFac = String(req.body?.fecFac ?? "").trim().slice(0, 10);
    if (!numFac) throw new HttpError(400, "Falta el número de factura (NumFac) del QR");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecFac)) throw new HttpError(400, "Fecha de factura (FecFac) inválida");
    // Fin del rango (opcional, para búsqueda manual de facturas de días anteriores).
    let fecFin = String(req.body?.fecFin ?? "").trim().slice(0, 10);
    if (fecFin && !/^\d{4}-\d{2}-\d{2}$/.test(fecFin)) throw new HttpError(400, "Fecha fin inválida");
    if (!fecFin) fecFin = fecFac;
    // Si vienen invertidas, se ordenan para no romper la consulta.
    const fechaInicio = fecFin < fecFac ? fecFin : fecFac;
    const fechaFin = fecFin < fecFac ? fecFac : fecFin;
    // Ruta/grupo opcional con el que se organiza la factura (ej. "Ruta 1").
    const rutaBody = String(req.body?.ruta ?? "").trim().slice(0, 60) || null;

    const documento = numFacADocumento(numFac, origen);
    if (!documento) throw new HttpError(400, "No se pudo interpretar el número de factura");

    const base = origen === "INVERSIONES" ? env.FACTURAS_INV_URL : env.FACTURAS_AGRO_URL;
    const params = new URLSearchParams({
      cia,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      documento,
      ...(env.CLIENTES_TAT_TOKEN ? { token: env.CLIENTES_TAT_TOKEN } : {}),
    });

    let resp: Response;
    try {
      resp = await fetch(`${base}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const detalle = (err as Error)?.name ?? (err as Error)?.message ?? "desconocido";
      throw new HttpError(502, `No se pudo conectar con Siesa (${detalle})`);
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new HttpError(502, `Siesa respondió ${resp.status}: ${body.slice(0, 150)}`);
    }

    const json = (await resp.json()) as { data?: TatInvoice[] };
    const filas = json.data ?? [];
    if (filas.length === 0) {
      throw new HttpError(404, `No se encontró la factura ${documento} en ${origen}`);
    }

    const nit = String(filas[0].cliente_factura ?? "").trim();
    const numeroOrden = String(filas[0].nro_documento ?? documento).trim();

    // Dirección/vendedor del maestro TAT por NIT (fallback si la factura no la trae).
    const clienteTat = nit
      ? await prisma.clienteTat.findFirst({
          where: { nit, eliminado: false },
          select: { direccion1: true, vendedor: true },
        })
      : null;
    const dirMaestro = (clienteTat?.direccion1 ?? "").trim();

    // Preserva el vehículo y la ruta si esta factura ya estaba cargada.
    const previa = await prisma.orden.findFirst({
      where: { numeroOrden, distribucion: "TAT", tatOrigen: origen },
      select: { asignadoVehiculo: true, ruta: true },
    });
    const vehiculo = previa?.asignadoVehiculo ?? null;
    // Ruta enviada > ruta previa (no se pierde al re-escanear sin grupo).
    const ruta = rutaBody ?? previa?.ruta ?? null;

    const codigo = nit ? claveNitSucursal(nit, filas[0].codigo_sucursal) : null;
    const dirInv = String(filas[0].direccion_sucursal ?? "").trim();
    const dirInvOk = dirInv.length >= 2 && !NO_DIRECCION_TAT.has(dirInv.toUpperCase());
    const direccion = dirInvOk ? dirInv : (dirMaestro && esDireccionTatValida(dirMaestro) ? dirMaestro : null);
    const destino = codigo ?? direccion ?? nit;

    // Una línea por producto de la factura.
    const lineas = filas.map((f) => ({
      fecha: fechaFacturaADMY(f.fecha_documento, fecFac),
      numeroOrden,
      cliente: String(f.razon_social_cliente ?? "").trim(),
      destino,
      producto: limpiarProductoTat(String(f.tipo_comercial ?? "")) || "MERCANCÍA",
      cantidadKg: Number(f.cantidad_inv) || 0,
      nit: codigo,
      codigo,
      direccion,
      vendedor: clienteTat?.vendedor?.trim() ?? null,
      valor: Number(f.valor_subtotal) || 0,
      estado: "Pendiente",
      distribucion: "TAT",
      tatOrigen: origen,
      asignadoVehiculo: vehiculo,
      ruta,
    }));

    // Reemplaza solo ESTA factura (idempotente al re-escanear), acumula el resto.
    await prisma.$transaction([
      prisma.orden.deleteMany({ where: { numeroOrden, distribucion: "TAT", tatOrigen: origen } }),
      prisma.orden.createMany({ data: lineas }),
    ]);

    const totalKg = Math.round(lineas.reduce((s, l) => s + l.cantidadKg, 0) * 100) / 100;
    const totalValor = Math.round(lineas.reduce((s, l) => s + l.valor, 0));
    res.status(201).json({
      numeroOrden,
      cliente: lineas[0].cliente,
      destino,
      direccion,
      productos: lineas.map((l) => ({ producto: l.producto, kg: l.cantidadKg, valor: l.valor })),
      totalKg,
      totalValor,
      origen,
      ruta,
    });
  } catch (err) {
    next(err);
  }
});


// POST /api/ordenes/eliminar  -> elimina órdenes específicas por ids
router.post("/eliminar", requireAuth, requirePermiso("/ordenes"), async (req, res, next) => {
  try {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, "No se recibieron órdenes para eliminar");
    }
    const { count } = await prisma.orden.deleteMany({
      where: { id: { in: ids.map(String) } },
    });
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

// POST /api/ordenes/asignar-ruta  -> asigna (o limpia con ruta vacía) la ruta/grupo a órdenes por ids
router.post("/asignar-ruta", requireAuth, requirePermiso("/ordenes"), async (req, res, next) => {
  try {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, "No se recibieron órdenes");
    }
    const ruta = String(req.body?.ruta ?? "").trim().slice(0, 60) || null;
    const { count } = await prisma.orden.updateMany({
      where: { id: { in: ids.map(String) } },
      data: { ruta },
    });
    res.json({ actualizados: count, ruta });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/ordenes?tipo=B|P|I|AGRO|TAT  -> elimina según el filtro; sin tipo borra todo
router.delete("/", requireAuth, async (req, res, next) => {
  try {
    const tipo = String(req.query?.tipo ?? "").toUpperCase();
    let where: {
      distribucion?: string;
      numeroOrden?: { startsWith: string };
      tatOrigen?: string;
    } = {};
    if (tipo === "B" || tipo === "P" || tipo === "I") {
      where = { distribucion: "AGROPECUARIA", numeroOrden: { startsWith: tipo } };
    } else if (tipo === "AGRO") {
      where = { distribucion: "AGROPECUARIA" };
    } else if (tipo === "TATAGRO") {
      where = { distribucion: "TAT", tatOrigen: "AGROPECUARIA" };
    } else if (tipo === "TATINV") {
      where = { distribucion: "TAT", tatOrigen: "INVERSIONES" };
    } else if (tipo === "TAT") {
      where = { distribucion: "TAT" };
    } else {
      // Sin tipo = borra TODAS las órdenes: solo administradores.
      if (req.user?.role !== "ADMIN" && req.user?.role !== "DEVELOPER") {
        throw new HttpError(403, "Eliminar todas las órdenes requiere rol administrador");
      }
    }
    const { count } = await prisma.orden.deleteMany({ where });
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

// POST /api/ordenes/sync-drivin-estado
// Consulta las pruebas de entrega (POD) de Drivin y refleja el estado de cada
// orden (por número de factura) en el nivel de servicio.
router.post("/sync-drivin-estado", requireAuth, requirePermiso("/nivel-de-servicio"), async (_req, res, next) => {
  try {
    const DRIVIN_HEADERS = () => ({
      "X-API-Key": env.DRIVIN_API_KEY ?? "",
      "Content-Type": "application/json",
    });

    // Normaliza el código de orden/factura para comparar (Drivin a veces guarda
    // espacios internos, p. ej. "FE -00023545").
    const norm = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, "").toUpperCase();

    // Ventana de 2 días en zona horaria de Colombia (cubre el cambio de día UTC).
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

    // Trae las pruebas de entrega del día: cada registro incluye el código de la
    // orden (= número de factura) y su estado de entrega.
    const podResp = await fetch(
      `${env.DRIVIN_API_URL}/v3/pods?start_date=${ayer}&end_date=${hoy}`,
      { headers: DRIVIN_HEADERS() }
    );
    if (!podResp.ok) throw new HttpError(502, `No se pudo consultar Drivin (${podResp.status})`);

    const podData = (await podResp.json()) as {
      data?: {
        attributes?: {
          code?: string;
          status?: string;
          reason?: string;
          reason_code?: string;
          scenario_token?: string;
        };
      }[];
    };
    const pods = podData.data ?? [];

    // Traduce el status de la POD de Drivin al estado de la orden y del nivel de
    // servicio (novedad). approved = entregado OK; partial = entrega parcial;
    // rejected = rechazo; pending / in-transit = aún en ruta.
    function mapearEstado(status: string): { orden: string | null; nivel: string | null } {
      switch (status.toLowerCase()) {
        case "approved": return { orden: "Entregado", nivel: null };
        case "partial": return { orden: "Entregado", nivel: "Parcial Con Novedad" };
        case "rejected": return { orden: "Rechazado", nivel: "Rechazado" };
        case "pending":
        case "in-transit": return { orden: "Enviado", nivel: null };
        default: return { orden: null, nivel: null };
      }
    }

    // Mapa numeroOrden(normalizado) -> órdenes en BD (para actualizar por id).
    const ordenesActivas = await prisma.orden.findMany({ select: { id: true, numeroOrden: true, estado: true } });
    const ordenPorCode = new Map<string, { id: string; estado: string }[]>();
    for (const o of ordenesActivas) {
      const k = norm(o.numeroOrden);
      const arr = ordenPorCode.get(k);
      if (arr) arr.push(o); else ordenPorCode.set(k, [o]);
    }

    // Mapa numeroOrden(normalizado) -> planilla activa (para crear novedades).
    const planillasActivas = await prisma.planillaDespacho.findMany({
      where: { anulada: false },
    });
    const planillaPorOrden = new Map<string, (typeof planillasActivas)[number] & { itemCliente?: string }>();
    for (const p of planillasActivas) {
      let items: { numeroOrden?: string; cliente?: string }[] = [];
      try { items = p.items ? JSON.parse(p.items) : []; } catch { items = []; }
      for (const it of items) {
        if (it.numeroOrden) planillaPorOrden.set(norm(it.numeroOrden), { ...p, itemCliente: it.cliente });
      }
    }

    // Precarga novedades de las planillas activas (evita N+1 dentro del loop).
    const planillaIds = planillasActivas.map((p) => p.id);
    const novedadesExistentes = planillaIds.length
      ? await prisma.novedad.findMany({ where: { planillaId: { in: planillaIds } } })
      : [];
    const novedadPorClave = new Map<string, (typeof novedadesExistentes)[number]>();
    for (const n of novedadesExistentes) {
      if (n.planillaId && n.numeroOrden) novedadPorClave.set(`${n.planillaId}||${norm(n.numeroOrden)}`, n);
    }
    const nuevasNovedades: {
      consecutivo: number; fecha: string; estadoEntrega: string; novedad: string | null;
      planillaId: string; placa: string | null; conductor: string | null;
      auxiliarRuta: string | null; cliente: string | null; numeroOrden: string;
    }[] = [];

    let actualizados = 0;
    const conteo = { approved: 0, partial: 0, rejected: 0, pending: 0, otros: 0 };

    for (const pod of pods) {
      const a = pod.attributes;
      if (!a?.code) continue;
      const code = norm(a.code);
      const status = (a.status ?? "").toLowerCase();
      if (status in conteo) conteo[status as keyof typeof conteo]++; else conteo.otros++;

      const { orden: nuevoEstado, nivel: nivelEstado } = mapearEstado(status);
      const motivo = a.reason || a.reason_code || null;

      // Actualiza el estado de la(s) orden(es) que coinciden por número de factura.
      const ordenes = ordenPorCode.get(code);
      if (nuevoEstado && ordenes?.length) {
        const idsAActualizar = ordenes.filter((o) => o.estado !== nuevoEstado).map((o) => o.id);
        if (idsAActualizar.length) {
          const { count } = await prisma.orden.updateMany({
            where: { id: { in: idsAActualizar } },
            data: {
              estado: nuevoEstado,
              podCode: a.code ?? null,
              ...(a.scenario_token ? { scenarioToken: a.scenario_token } : {}),
              ...(a.reason_code ? { reasonCode: a.reason_code } : {}),
              ...(motivo ? { reasonName: motivo } : {}),
            },
          });
          actualizados += count;
          for (const o of ordenes) o.estado = nuevoEstado;
        }
      }

      // Nivel de servicio: reflejar Rechazado / Parcial Con Novedad desde Drivin.
      const planilla = planillaPorOrden.get(code);
      if (nivelEstado && planilla) {
        const existente = novedadPorClave.get(`${planilla.id}||${code}`);
        if (existente) {
          // No pisar un estado ya trabajado manualmente distinto de "Sin Novedad".
          if (existente.estadoEntrega === "Sin Novedad" || existente.estadoEntrega === nivelEstado) {
            await prisma.novedad.update({
              where: { id: existente.id },
              data: {
                estadoEntrega: nivelEstado,
                ...(motivo ? { novedad: motivo } : {}),
              },
            });
          }
        } else {
          nuevasNovedades.push({
            consecutivo: planilla.consecutivo,
            fecha: planilla.fecha,
            estadoEntrega: nivelEstado,
            novedad: motivo,
            planillaId: planilla.id,
            placa: planilla.placa,
            conductor: planilla.conductor,
            auxiliarRuta: planilla.auxiliarRuta,
            cliente: planilla.itemCliente ?? null,
            numeroOrden: a.code,
          });
          // Evita duplicados si el mismo code llega repetido.
          novedadPorClave.set(`${planilla.id}||${code}`, { estadoEntrega: nivelEstado } as (typeof novedadesExistentes)[number]);
        }
      }
    }

    if (nuevasNovedades.length) {
      await prisma.novedad.createMany({ data: nuevasNovedades });
    }

    res.json({ actualizados, pods: pods.length, conteo });
  } catch (err) {
    next(err);
  }
});

export default router;
