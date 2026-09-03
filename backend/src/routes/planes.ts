import { Router } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import {
  fetchDrivinAddresses,
  buildAddressIndex,
  matchDrivinAddress,
} from "../lib/drivinAddresses";

const router = Router();

// Estados que NO se envían a Drivin (ya enviadas o finalizadas). El resto de
// órdenes asignadas (Pendiente, Parcial, etc.) sí se envían, igual que en asignación.
const ESTADOS_NO_ENVIABLES = ["Enviado", "Entregado", "Rechazado"];

const DRIVIN_HEADERS = () => ({
  "X-API-Key": env.DRIVIN_API_KEY ?? "",
  "Content-Type": "application/json",
});

function normKey(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function titleCase(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim();
}

// Alias: nombre en las órdenes → nombre real en Drivin / Clientes GS.
const CLIENTES_ALIAS: Record<string, string> = {
  "MEGATIENDA SANTA CRUZ": "Megatienda Altos De Santacruz",
};

// Clave normalizada para cruzar consecutivos/concatenados (igual que en ordenes).
function claveCliente(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Un concatenado que es un NIT (o NIT-sucursal) enruta la orden a otro cliente.
function esConcatNit(k: string): boolean {
  return /^\d{5,}(?:-\d+)?$/.test(k);
}

// Identidad de cliente TAT por sucursal: NIT-<entero>.
function claveNitSucursal(nit: string, sucursal: string | null): string {
  const suc = parseInt(String(sucursal ?? "").trim(), 10);
  return Number.isFinite(suc) ? `${nit}-${suc}` : nit;
}

// Construye el payload del escenario a partir de las órdenes asignadas en BD.
async function buildScenarioPayload(opts: {
  descripcion: string;
  fecha: string;
  schemaName: string;
  fleetName: string | null;
  placas?: string[];
}) {
  const where: Record<string, unknown> = {
    asignadoVehiculo: { not: null },
    estado: { notIn: ESTADOS_NO_ENVIABLES },
  };
  // Si se pasan placas específicas, filtrar solo esas
  if (opts.placas && opts.placas.length > 0) {
    const upper = opts.placas.map((p) => p.toUpperCase());
    where.asignadoVehiculo = { in: upper };
  }
  const ordenes = await prisma.orden.findMany({ where });
  if (ordenes.length === 0) {
    throw new HttpError(400, "No hay órdenes asignadas para crear el plan");
  }

  const clientesGS = await prisma.cliente.findMany();
  const clientesTat = await prisma.clienteTat.findMany({
    where: { eliminado: false },
    select: {
      codigoTercero: true, nit: true, sucursal: true, razonSocial: true,
      direccion1: true, ciudad: true, departamento: true, pais: true,
      lat: true, lon: true, consecutivos: true,
    },
  });

  // Direcciones registradas en Drivin + el maestro GS (para asignar el código
  // correcto por cliente/destino, aunque Drivin no tenga registrado al cliente).
  const drivinAddresses = await fetchDrivinAddresses();
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
  const drivinIndex = buildAddressIndex([...drivinAddresses, ...gsAddresses]);

  type GeoEntry = {
    direccion: string | null;
    ciudad: string | null;
    pais: string | null;
    lat: string | null;
    lon: string | null;
  };
  const geoMap = new Map<string, GeoEntry>();
  const geoByDest = new Map<string, GeoEntry>();
  const geoByCliente = new Map<string, GeoEntry>();

  for (const c of clientesGS) {
    const entry: GeoEntry = {
      direccion: c.direccion,
      ciudad: c.provincia ?? c.region ?? null,
      pais: c.pais,
      lat: c.lat,
      lon: c.lon,
    };
    if (c.cliente && c.nombreDireccion)
      geoMap.set(`${normKey(c.cliente)}||${normKey(c.nombreDireccion)}`, entry);
    if (c.nombreDireccion && !geoByDest.has(normKey(c.nombreDireccion)))
      geoByDest.set(normKey(c.nombreDireccion), entry);
    // Fallback por nombre de cliente cuando el destino no coincide con nombreDireccion.
    if (c.cliente && !geoByCliente.has(normKey(c.cliente)))
      geoByCliente.set(normKey(c.cliente), entry);
  }

  // Ruteo por concatenado: NIT (TAT) o "cliente - destino"/"destino" (GS) agregado
  // en OTRO cliente de la BD. Ese cliente destino aporta código/nombre/dirección/geo.
  type ClienteInfo = {
    nombre?: string; direccion?: string; codigo?: string;
    ciudad?: string | null; pais?: string | null; lat?: string | null; lng?: string | null;
  };
  const porNitConcat = new Map<string, ClienteInfo>();
  const porConsecutivo = new Map<string, ClienteInfo>();
  const indexarConcat = (consecutivos: string | null, info: ClienteInfo) => {
    if (!consecutivos) return;
    let lista: string[] = [];
    try { lista = JSON.parse(consecutivos) as string[]; } catch { return; }
    for (const con of lista) {
      const k = claveCliente(con);
      if (!k) continue;
      if (esConcatNit(k)) { if (!porNitConcat.has(k)) porNitConcat.set(k, info); }
      else if (!porConsecutivo.has(k)) porConsecutivo.set(k, info);
    }
  };
  for (const c of clientesGS) {
    indexarConcat(c.consecutivos, {
      nombre: c.cliente ?? undefined,
      direccion: c.direccion ?? undefined,
      codigo: c.codigoDireccion ?? undefined,
      ciudad: c.provincia ?? c.region ?? null,
      pais: c.pais,
      lat: c.lat,
      lng: c.lon,
    });
  }
  for (const c of clientesTat) {
    indexarConcat(c.consecutivos, {
      nombre: c.razonSocial ?? undefined,
      direccion: c.direccion1 ?? undefined,
      codigo: c.nit ? claveNitSucursal(c.nit, c.sucursal) : (c.codigoTercero ?? undefined),
      ciudad: c.ciudad ?? c.departamento ?? null,
      pais: c.pais,
      lat: c.lat,
      lng: c.lon,
    });
  }

  type Linea = (typeof ordenes)[0];
  const porDireccion = new Map<
    string,
    { cliente: string; destino: string; pedidos: Map<string, Linea[]> }
  >();
  for (const o of ordenes) {
    const dirKey = `${normKey(o.cliente)}||${normKey(o.destino)}`;
    let dir = porDireccion.get(dirKey);
    if (!dir) {
      dir = { cliente: o.cliente, destino: o.destino, pedidos: new Map() };
      porDireccion.set(dirKey, dir);
    }
    const pedLines = dir.pedidos.get(o.numeroOrden) ?? [];
    pedLines.push(o);
    dir.pedidos.set(o.numeroOrden, pedLines);
  }

  const clients = [];
  for (const [dirKey, { cliente, destino, pedidos }] of porDireccion) {
    // Aplica alias si el cliente tiene un nombre distinto en GS/Drivin.
    const clienteGS = CLIENTES_ALIAS[normKey(cliente)] ?? cliente;

    // Cruza contra las direcciones de Drivin para obtener su código de registro.
    const drivinMatch =
      matchDrivinAddress(drivinIndex, clienteGS, destino) ??
      matchDrivinAddress(drivinIndex, cliente, destino);

    // TAT con sucursal: el código guardado es NIT-sucursal (identidad única por
    // sucursal). Se envía tal cual a Drivin —junto con su dirección real— para
    // que cada sucursal sea un cliente distinto y no se colapsen por el NIT.
    const primeraLinea = pedidos.values().next().value?.[0] as Linea | undefined;
    const esTat = primeraLinea?.distribucion === "TAT";
    const codigoTat = esTat ? primeraLinea?.codigo ?? null : null;
    const direccionTat = esTat ? primeraLinea?.direccion ?? null : null;

    // Ruteo por concatenado: primero el cliente al que se concatenó este (por NIT
    // en TAT, o por "cliente - destino"/"destino" en GS); si no hay, el propio.
    const nitLinea = primeraLinea?.nit ?? null;
    const asignado =
      (nitLinea ? porNitConcat.get(claveCliente(nitLinea)) : undefined) ??
      porConsecutivo.get(claveCliente(`${cliente} - ${destino}`)) ??
      porConsecutivo.get(claveCliente(destino));

    // Busca geo en Clientes GS: exacto → por destino → por nombre alias → por nombre original.
    const geo =
      geoMap.get(`${normKey(clienteGS)}||${normKey(destino)}`) ??
      geoMap.get(dirKey) ??
      geoByDest.get(normKey(destino)) ??
      geoByCliente.get(normKey(clienteGS)) ??
      geoByCliente.get(normKey(cliente)) ??
      null;
    const city = asignado?.ciudad || geo?.ciudad || clienteGS || destino;
    const orders = [];
    for (const [numeroOrden, lineas] of pedidos) {
      // Agrupa por producto y suma los kg.
      const productMap = new Map<string, number>();
      for (const l of lineas) {
        const k = l.producto || "Sin descripción";
        productMap.set(k, (productMap.get(k) ?? 0) + l.cantidadKg);
      }
      // Drivin muestra `units` como "CANT" en el detalle: enviamos los kg ahí
      // (y también en units_1, que es la capacidad/peso del ítem).
      const items = Array.from(productMap.entries()).map(([desc, kg], i) => {
        const kgR = Math.round(kg * 100) / 100;
        return { code: `${numeroOrden}-${i + 1}`, description: desc, units: kgR, units_1: kgR };
      });
      const totalKg = Math.round(lineas.reduce((s, l) => s + l.cantidadKg, 0) * 100) / 100;
      // Total de dinero de la remisión (recaudo). Drivin lo lee en custom_3.
      const totalValor = Math.round(lineas.reduce((s, l) => s + (l.valor ?? 0), 0));
      orders.push({
        code: numeroOrden,
        alt_code: `${normKey(cliente)}-${normKey(destino)}`,
        units: totalKg,
        units_1: totalKg,
        custom_3: String(totalValor),
        vehicle_code: lineas[0].asignadoVehiculo,
        items,
      });
    }
    // Info final a Drivin: primero la del cliente al que se concatenó; si no, la propia.
    const nombreFinal = asignado?.nombre ?? clienteGS;
    const latStr = asignado?.lat ?? geo?.lat ?? null;
    const lngStr = asignado?.lng ?? geo?.lon ?? null;
    // Código de la dirección/cliente: identifica la dirección en el maestro de
    // Drivin. Debe ir como `code` (identificador de la dirección) y `client_code`.
    const codigoFinal = asignado?.codigo ?? codigoTat ?? drivinMatch?.code ?? null;
    clients.push({
      code: codigoFinal,
      name: titleCase(nombreFinal),
      client_name: titleCase(nombreFinal),
      client_code: codigoFinal,
      address: titleCase(asignado?.direccion ?? direccionTat ?? drivinMatch?.address1 ?? geo?.direccion ?? destino),
      city: titleCase(city),
      country: asignado?.pais ?? geo?.pais ?? "Colombia",
      lat: latStr ? parseFloat(latStr) : null,
      lng: lngStr ? parseFloat(lngStr) : null,
      orders,
    });
  }

  const vehiculos = [...new Set(ordenes.map((o) => o.asignadoVehiculo!))].map(
    (placa) => ({ code: placa, description: placa })
  );

  return {
    description: opts.descripcion,
    date: opts.fecha,
    fleet_name: opts.fleetName,
    schema_name: opts.schemaName,
    clients,
    vehicles: vehiculos,
    _ordenesCount: ordenes.length,
  };
}

// GET /api/planes?date=YYYY-MM-DD  -> lista escenarios de Drivin
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const date =
      String(req.query.date ?? "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const resp = await fetch(
      `${env.DRIVIN_API_URL}/v2/scenarios?date=${date}`,
      { headers: DRIVIN_HEADERS() }
    );
    if (!resp.ok) throw new HttpError(502, `Drivin respondió ${resp.status}`);

    const data = (await resp.json()) as { response?: unknown[] };
    res.json(data.response ?? []);
  } catch (err) {
    next(err);
  }
});

// GET /api/planes/schemas  -> schemas únicos de los últimos 30 días
router.get("/schemas", requireAuth, async (_req, res, next) => {
  try {
    const hoy = new Date();
    const schemas = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const resp = await fetch(
        `${env.DRIVIN_API_URL}/v2/scenarios?date=${date}`,
        { headers: DRIVIN_HEADERS() }
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as {
        response?: { schema_name?: string | null }[];
      };
      for (const s of data.response ?? []) {
        if (s.schema_name) schemas.add(s.schema_name);
      }
      if (schemas.size > 0) break;
    }
    res.json(Array.from(schemas).sort());
  } catch (err) {
    next(err);
  }
});

// GET /api/planes/flotas  -> flotas únicas de los vehículos de Drivin
router.get("/flotas", requireAuth, async (_req, res, next) => {
  try {
    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/vehicles`, {
      headers: DRIVIN_HEADERS(),
    });
    if (!resp.ok) throw new HttpError(502, `Drivin respondió ${resp.status}`);

    const data = (await resp.json()) as {
      response?: { fleets?: string | null }[];
    };
    const flotas = new Set<string>();
    for (const v of data.response ?? []) {
      if (v.fleets?.trim()) flotas.add(v.fleets.trim());
    }
    res.json(Array.from(flotas).sort());
  } catch (err) {
    next(err);
  }
});

// POST /api/planes  -> crea un escenario en Drivin con las órdenes asignadas
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const descripcion = String(req.body?.descripcion ?? "").trim();
    const fecha = String(req.body?.fecha ?? "").trim();
    const schemaName = String(
      req.body?.schemaName ?? "Distribucion Rutas Agropecuaria"
    ).trim();
    const fleetName = String(req.body?.fleetName ?? "").trim() || null;
    const placas = Array.isArray(req.body?.placas) ? (req.body.placas as string[]) : undefined;

    if (!descripcion || !fecha) {
      throw new HttpError(400, "Descripción y fecha son obligatorias");
    }

    const payload = await buildScenarioPayload({
      descripcion,
      fecha,
      schemaName,
      fleetName,
      placas,
    });

    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/scenarios`, {
      method: "POST",
      headers: DRIVIN_HEADERS(),
      body: JSON.stringify(payload),
    });

    const result = (await resp.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!resp.ok) {
      throw new HttpError(
        502,
        `Drivin ${resp.status}: ${JSON.stringify(result).slice(0, 300)}`
      );
    }

    // Marca solo las órdenes enviadas (respetando filtro de placas si aplica)
    const updateWhere: Record<string, unknown> = {
      asignadoVehiculo: { not: null },
      estado: { notIn: ESTADOS_NO_ENVIABLES },
    };
    if (placas && placas.length > 0) {
      updateWhere.asignadoVehiculo = { in: placas.map((p) => p.toUpperCase()) };
    }
    await prisma.orden.updateMany({
      where: updateWhere,
      data: { estado: "Enviado" },
    });

    res.status(201).json({
      ...result,
      _meta: {
        vehiculos: payload.vehicles.length,
        direcciones: payload.clients.length,
        ordenes: (payload as { _ordenesCount?: number })._ordenesCount ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/planes/preview  -> construye el payload sin enviarlo a Drivin
router.get("/preview", requireAuth, async (_req, res, next) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const payload = await buildScenarioPayload({
      descripcion: "PREVIEW",
      fecha: hoy,
      schemaName: "Distribucion Rutas Agropecuaria",
      fleetName: null,
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /api/planes/agregar  -> agrega órdenes a un escenario existente sin crear uno nuevo
router.post("/agregar", requireAuth, async (req, res, next) => {
  try {
    const scenarioToken = String(req.body?.scenarioToken ?? "").trim();
    if (!scenarioToken) throw new HttpError(400, "Falta el token del escenario");

    // 1. Verificar estado del escenario.
    const scenResp = await fetch(
      `${env.DRIVIN_API_URL}/v2/scenarios?date=${new Date().toISOString().slice(0, 10)}`,
      { headers: DRIVIN_HEADERS() }
    );
    if (!scenResp.ok) throw new HttpError(502, "No se pudo consultar el escenario en Drivin");
    const scenData = (await scenResp.json()) as {
      response?: { token?: string; status?: string; description?: string }[];
    };
    const escenario = scenData.response?.find((s) => s.token === scenarioToken);
    if (!escenario) throw new HttpError(404, "Escenario no encontrado");
    if (escenario.status === "Finished") {
      throw new HttpError(409, `El escenario "${escenario.description}" ya está Finalizado`);
    }

    // 2. Obtener órdenes ya existentes en el escenario para detectar duplicados.
    const existingResp = await fetch(
      `${env.DRIVIN_API_URL}/v2/orders?token=${scenarioToken}`,
      { headers: DRIVIN_HEADERS() }
    );
    const existingData = (await existingResp.json().catch(() => ({}))) as {
      response?: { orders?: { code?: string | null }[] }[];
    };
    const codigosExistentes = new Set<string>();
    for (const addr of existingData.response ?? []) {
      for (const ord of addr.orders ?? []) {
        if (ord.code) codigosExistentes.add(ord.code);
      }
    }

    // 3. Construir payload con las órdenes asignadas pendientes.
    const payload = await buildScenarioPayload({
      descripcion: "AGREGAR",
      fecha: new Date().toISOString().slice(0, 10),
      schemaName: "Distribucion Rutas Agropecuaria",
      fleetName: null,
    });

    // 4. Filtrar duplicados: solo enviar órdenes que NO existen ya.
    const clientesFiltrados = payload.clients
      .map((c) => ({
        ...c,
        orders: c.orders.filter(
          (o: { code: string }) => !codigosExistentes.has(o.code)
        ),
      }))
      .filter((c) => c.orders.length > 0);

    const totalNuevas = clientesFiltrados.reduce(
      (s: number, c) => s + c.orders.length,
      0
    );
    const totalDuplicadas =
      (payload._ordenesCount ?? 0) - totalNuevas;

    if (totalNuevas === 0) {
      return res.json({
        _meta: {
          existentes: codigosExistentes.size,
          nuevas: 0,
          duplicadas: totalDuplicadas,
          mensaje: "No hay órdenes nuevas para agregar",
        },
      });
    }

    // 5. Agregar las órdenes nuevas al escenario existente.
    const addResp = await fetch(
      `${env.DRIVIN_API_URL}/v2/orders?token=${scenarioToken}`,
      {
        method: "POST",
        headers: DRIVIN_HEADERS(),
        body: JSON.stringify({ clients: clientesFiltrados }),
      }
    );
    const addResult = (await addResp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!addResp.ok) {
      throw new HttpError(
        502,
        `Drivin ${addResp.status}: ${JSON.stringify(addResult).slice(0, 300)}`
      );
    }

    // 6. Marcar las órdenes enviadas en la BD.
    await prisma.orden.updateMany({
      where: {
        asignadoVehiculo: { not: null },
        estado: { notIn: ESTADOS_NO_ENVIABLES },
      },
      data: { estado: "Enviado" },
    });

    const response = (addResult.response ?? {}) as Record<string, unknown>;
    res.status(201).json({
      ...addResult,
      _meta: {
        scenarioToken,
        descripcion: escenario.description,
        estado: escenario.status,
        existentes: codigosExistentes.size,
        nuevas: totalNuevas,
        duplicadas: totalDuplicadas,
        added: (response.added as string[] | undefined)?.length ?? 0,
        skipped: (response.skipped as string[] | undefined)?.length ?? 0,
        ordenes: payload._ordenesCount ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
