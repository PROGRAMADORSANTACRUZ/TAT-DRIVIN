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
    if (!a.alt_code) continue;
    map.set(normCodigo(a.alt_code), {
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
    const ordenes = await prisma.orden.findMany({
      where: todas ? undefined : { estado: { notIn: ["Entregado", "Rechazado"] } },
      orderBy: [{ cliente: "asc" }, { destino: "asc" }, { numeroOrden: "asc" }],
    });
    res.json(ordenes);
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
        select: { cliente: true, destino: true, numeroOrden: true },
      }),
      fetchDrivinAddresses(),
      prisma.cliente.findMany({
        select: { codigoDireccion: true, consecutivos: true },
      }),
    ]);
    // Clientes TAT con concatenados (código = codigoTercero).
    const clientesTat = await prisma.clienteTat.findMany({
      where: { eliminado: false, consecutivos: { not: null } },
      select: { codigoTercero: true, consecutivos: true },
    });

    const index = buildAddressIndex(addresses);

    // Mapa de consecutivo (normalizado) -> código del cliente en nuestra BD.
    const porConsecutivo = new Map<string, string | null>();
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
        if (k && !porConsecutivo.has(k)) porConsecutivo.set(k, c.codigoDireccion);
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
        if (k && !porConsecutivo.has(k)) porConsecutivo.set(k, c.codigoTercero);
      }
    }

    // Agrupa por par cliente||destino.
    const grupos = new Map<
      string,
      { cliente: string; destino: string; pedidos: Set<string> }
    >();
    for (const o of ordenes) {
      const key = `${claveCliente(o.cliente)}||${claveCliente(o.destino)}`;
      let g = grupos.get(key);
      if (!g) {
        g = { cliente: o.cliente, destino: o.destino, pedidos: new Set() };
        grupos.set(key, g);
      }
      g.pedidos.add(o.numeroOrden);
    }

    const sinRegistrar: {
      cliente: string;
      destino: string;
      pedidos: number;
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
      const codigoManual =
        porConsecutivo.get(consecutivo) ??
        porConsecutivo.get(claveCliente(g.destino));
      const match = codigoManual
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
          pedidos: g.pedidos.size,
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

      const ordenes = (tipo === "I" ? parseOrdenesInversiones(req.file.buffer) : parseOrdenes(req.file.buffer)).map((o) => ({
        ...o,
        numeroOrden: o.numeroOrden ? tipo + o.numeroOrden : o.numeroOrden,
      }));
      if (ordenes.length === 0) {
        throw new HttpError(400, "El archivo no contiene órdenes válidas");
      }

      // Cruza con los PODs de Drivin para marcar las entregadas.
      const isoDates = ordenes
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

      const data = ordenes.map((o) => {
        const pod = podEstados.get(normCodigo(`${o.cliente}-${o.destino}`));
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
  tipo_comercial?: string;
  cantidad_inv?: number;
  valor_subtotal?: number;
}

// Convierte "2026-08-27" (ISO) a "27/08/2026" (formato del resto de órdenes).
// (Se reutiliza el helper isoToDDMMYYYY definido arriba.)

// Cada origen TAT corresponde a una compañía distinta en la API.
const TAT_ORIGENES: Record<string, string> = {
  AGROPECUARIA: "3",
  INVERSIONES: "8",
};

router.post("/sync-tat", requireAuth, requirePermiso("/ordenes"), async (req, res, next) => {
  try {
    const origen = String(req.body?.origen ?? "AGROPECUARIA").toUpperCase();
    const cia = TAT_ORIGENES[origen];
    if (!cia) {
      throw new HttpError(400, "Origen inválido (AGROPECUARIA o INVERSIONES)");
    }

    const url = env.TAT_INVOICES_URL.replace("{cia}", cia);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new HttpError(502, `La API de facturas respondió ${resp.status}`);
    }

    const filas = (await resp.json()) as TatInvoice[];
    if (!Array.isArray(filas)) {
      throw new HttpError(502, "Respuesta inválida de la API de facturas");
    }

    // Preserva la asignación de vehículo por número de factura al re-sincronizar.
    const existentes = await prisma.orden.findMany({
      where: { distribucion: "TAT", tatOrigen: origen },
      select: { numeroOrden: true, asignadoVehiculo: true },
    });
    const asignPorNumero = new Map<string, string | null>();
    for (const e of existentes) asignPorNumero.set(e.numeroOrden, e.asignadoVehiculo);

    // Busca la dirección de cada cliente TAT por su NIT para usarla como destino.
    const nits = Array.from(
      new Set(
        filas.map((f) => String(f.cliente_factura ?? "").trim()).filter(Boolean)
      )
    );
    const clientes = await prisma.clienteTat.findMany({
      where: { nit: { in: nits }, eliminado: false },
      select: { nit: true, direccion1: true },
    });
    const dirPorNit = new Map<string, string>();
    for (const c of clientes) {
      if (c.nit && c.direccion1 && !dirPorNit.has(c.nit)) {
        dirPorNit.set(c.nit, c.direccion1);
      }
    }

    const data = filas
      .filter((f) => f.nro_documento)
      .map((f) => {
        const numeroOrden = String(f.nro_documento);
        const nit = String(f.cliente_factura ?? "").trim();
        // Si el cliente existe en la base TAT, el destino es su dirección; si no, el NIT.
        const destino = dirPorNit.get(nit) ?? nit;
        return {
          fecha: isoToDDMMYYYY(String(f.fecha_documento ?? "")),
          numeroOrden,
          cliente: String(f.razon_social_cliente ?? "").trim(),
          destino,
          producto: String(f.tipo_comercial ?? "").trim(),
          cantidadKg: Number(f.cantidad_inv) || 0,
          estado: "Pendiente",
          distribucion: "TAT",
          tatOrigen: origen,
          asignadoVehiculo: asignPorNumero.get(numeroOrden) ?? null,
        };
      });

    if (data.length === 0) {
      throw new HttpError(502, "La API no devolvió facturas");
    }

    // Reemplaza solo las facturas de ese origen, preservando el otro.
    await prisma.$transaction([
      prisma.orden.deleteMany({ where: { distribucion: "TAT", tatOrigen: origen } }),
      prisma.orden.createMany({ data }),
    ]);

    res.status(201).json({ importados: data.length, origen });
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
    } = {};
    if (tipo === "B" || tipo === "P" || tipo === "I") {
      where = { distribucion: "AGROPECUARIA", numeroOrden: { startsWith: tipo } };
    } else if (tipo === "AGRO") {
      where = { distribucion: "AGROPECUARIA" };
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
// Consulta Drivin por los escenarios del día y actualiza el estado de órdenes Enviadas
router.post("/sync-drivin-estado", requireAuth, requirePermiso("/nivel-de-servicio"), async (_req, res, next) => {
  try {
    const DRIVIN_HEADERS = () => ({
      "X-API-Key": env.DRIVIN_API_KEY ?? "",
      "Content-Type": "application/json",
    });

    const today = new Date().toISOString().slice(0, 10);

    // Obtener escenarios del día
    const scenResp = await fetch(
      `${env.DRIVIN_API_URL}/v2/scenarios?date=${today}`,
      { headers: DRIVIN_HEADERS() }
    );
    if (!scenResp.ok) throw new HttpError(502, "No se pudo consultar Drivin");

    const scenData = (await scenResp.json()) as {
      response?: { token?: string; status?: string; description?: string }[];
    };
    const escenarios = scenData.response ?? [];

    // Mapa numeroOrden -> planilla activa (para poder crear novedades de nivel de servicio).
    const planillasActivas = await prisma.planillaDespacho.findMany({
      where: { anulada: false },
    });
    const planillaPorOrden = new Map<string, (typeof planillasActivas)[number] & { itemCliente?: string }>();
    for (const p of planillasActivas) {
      let items: { numeroOrden?: string; cliente?: string }[] = [];
      try { items = p.items ? JSON.parse(p.items) : []; } catch { items = []; }
      for (const it of items) {
        if (it.numeroOrden) planillaPorOrden.set(it.numeroOrden, { ...p, itemCliente: it.cliente });
      }
    }

    // Traduce el status de Drivin al estado de nivel de servicio (novedad).
    function nivelDesdeDrivin(status: string): string | null {
      const s = status.toLowerCase();
      if (s === "rejected") return "Rechazado";
      if (s.includes("partial")) return "Parcial Con Novedad";
      return null;
    }

    // Precarga novedades de las planillas activas (evita N+1 dentro del loop).
    const planillaIds = planillasActivas.map((p) => p.id);
    const novedadesExistentes = planillaIds.length
      ? await prisma.novedad.findMany({ where: { planillaId: { in: planillaIds } } })
      : [];
    const novedadPorClave = new Map<string, (typeof novedadesExistentes)[number]>();
    for (const n of novedadesExistentes) {
      if (n.planillaId && n.numeroOrden) novedadPorClave.set(`${n.planillaId}||${n.numeroOrden}`, n);
    }
    const nuevasNovedades: {
      consecutivo: number; fecha: string; estadoEntrega: string; novedad: string | null;
      planillaId: string; placa: string | null; conductor: string | null;
      auxiliarRuta: string | null; cliente: string | null; numeroOrden: string;
    }[] = [];

    let actualizados = 0;
    const detalle: { token: string; status: string; ordenes: number }[] = [];

    for (const esc of escenarios) {
      if (!esc.token) continue;

      // Obtener órdenes del escenario en Drivin
      const ordResp = await fetch(
        `${env.DRIVIN_API_URL}/v2/orders?token=${esc.token}`,
        { headers: DRIVIN_HEADERS() }
      );
      if (!ordResp.ok) continue;

      const ordData = (await ordResp.json()) as {
        response?: { orders?: { code?: string; status?: string; reason_code?: string; reason_name?: string }[] }[];
      };

      const ordenesDrivin: Map<string, { status: string; reason_code?: string; reason_name?: string }> = new Map();
      for (const addr of ordData.response ?? []) {
        for (const o of addr.orders ?? []) {
          if (o.code) ordenesDrivin.set(o.code, { status: o.status ?? "", reason_code: o.reason_code, reason_name: o.reason_name });
        }
      }

      // Actualizar órdenes en nuestra BD
      for (const [code, drivinOrden] of ordenesDrivin) {
        const nuevoEstado =
          drivinOrden.status === "delivered" ? "Entregado" :
          drivinOrden.status === "rejected" ? "Rechazado" :
          drivinOrden.status === "in_progress" ? "Enviado" : null;

        if (nuevoEstado) {
          const { count } = await prisma.orden.updateMany({
            where: { numeroOrden: code, estado: { in: ["Enviado", "Pendiente"] } },
            data: {
              estado: nuevoEstado,
              ...(drivinOrden.reason_code ? { reasonCode: drivinOrden.reason_code } : {}),
              ...(drivinOrden.reason_name ? { reasonName: drivinOrden.reason_name } : {}),
            },
          });
          actualizados += count;
        }

        // Nivel de servicio: reflejar Rechazado / Parcial Con Novedad desde Drivin.
        const nivelEstado = nivelDesdeDrivin(drivinOrden.status);
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
                  ...(drivinOrden.reason_name ? { novedad: drivinOrden.reason_name } : {}),
                },
              });
            }
          } else {
            nuevasNovedades.push({
              consecutivo: planilla.consecutivo,
              fecha: planilla.fecha,
              estadoEntrega: nivelEstado,
              novedad: drivinOrden.reason_name ?? null,
              planillaId: planilla.id,
              placa: planilla.placa,
              conductor: planilla.conductor,
              auxiliarRuta: planilla.auxiliarRuta,
              cliente: planilla.itemCliente ?? null,
              numeroOrden: code,
            });
            // Evita duplicados si el mismo code aparece en varios escenarios.
            novedadPorClave.set(`${planilla.id}||${code}`, { estadoEntrega: nivelEstado } as (typeof novedadesExistentes)[number]);
          }
        }
      }

      detalle.push({ token: esc.token, status: esc.status ?? "", ordenes: ordenesDrivin.size });
    }

    if (nuevasNovedades.length) {
      await prisma.novedad.createMany({ data: nuevasNovedades });
    }

    res.json({ actualizados, escenarios: detalle.length, detalle });
  } catch (err) {
    next(err);
  }
});

export default router;
