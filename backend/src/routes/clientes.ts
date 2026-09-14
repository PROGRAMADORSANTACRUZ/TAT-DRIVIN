import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import {
  fetchDrivinAddresses,
  buildAddressIndex,
  matchDrivinAddress,
} from "../lib/drivinAddresses";

// Cruza las órdenes pendientes contra Drivin y asigna a cada cliente (por su
// codigoDireccion) los consecutivos "cliente - destino" que le correspondan.
export async function asignarConsecutivosAuto(): Promise<{
  asignados: number;
  clientesAfectados: number;
}> {
  const [ordenes, addresses, clientes] = await Promise.all([
    prisma.orden.findMany({
      where: { estado: { notIn: ["Entregado", "Rechazado"] } },
      select: { cliente: true, destino: true },
    }),
    fetchDrivinAddresses(),
    prisma.cliente.findMany({
      select: { id: true, codigoDireccion: true, consecutivos: true },
    }),
  ]);

  const index = buildAddressIndex(addresses);
  const norm = (s: string) => (s ?? "").toUpperCase().trim();
  const clientePorCodigo = new Map<string, (typeof clientes)[number]>();
  for (const c of clientes) {
    if (c.codigoDireccion) clientePorCodigo.set(norm(c.codigoDireccion), c);
  }

  // Pares únicos cliente||destino.
  const pares = new Map<string, { cliente: string; destino: string }>();
  for (const o of ordenes) {
    pares.set(`${o.cliente}||${o.destino}`, {
      cliente: o.cliente,
      destino: o.destino,
    });
  }

  // Acumula nuevos consecutivos por cliente id.
  const nuevosPorCliente = new Map<string, Set<string>>();
  const listaActual = new Map<string, string[]>();
  for (const c of clientes) {
    listaActual.set(
      c.id,
      c.consecutivos ? (JSON.parse(c.consecutivos) as string[]) : []
    );
  }

  let asignados = 0;
  for (const { cliente, destino } of pares.values()) {
    const match = matchDrivinAddress(index, cliente, destino);
    if (!match?.code) continue;
    const target = clientePorCodigo.get(norm(match.code));
    if (!target) continue;
    const consecutivo = `${cliente} - ${destino}`;
    const actuales = listaActual.get(target.id) ?? [];
    if (actuales.some((x) => x.toUpperCase() === consecutivo.toUpperCase()))
      continue;
    let set = nuevosPorCliente.get(target.id);
    if (!set) {
      set = new Set();
      nuevosPorCliente.set(target.id, set);
    }
    set.add(consecutivo);
    asignados++;
  }

  // Persiste.
  for (const [id, nuevos] of nuevosPorCliente) {
    const combinada = [...(listaActual.get(id) ?? []), ...nuevos];
    await prisma.cliente.update({
      where: { id },
      data: { consecutivos: JSON.stringify(combinada) },
    });
  }

  return { asignados, clientesAfectados: nuevosPorCliente.size };
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Campo -> encabezado esperado en el Excel (hasta "Lon").
const CAMPOS: { key: keyof ClienteRow; header: string }[] = [
  { key: "codigoDireccion", header: "Código de Dirección" },
  { key: "nombreDireccion", header: "Nombre de Dirección" },
  { key: "cliente", header: "Cliente" },
  { key: "tipoDireccion", header: "Tipo de Dirección" },
  { key: "direccion", header: "Dirección" },
  { key: "referencia", header: "Referencia" },
  { key: "descripcion", header: "Descripción" },
  { key: "comuna", header: "Comuna" },
  { key: "provincia", header: "Provincia" },
  { key: "region", header: "Región" },
  { key: "pais", header: "País" },
  { key: "codigoPostal", header: "Código Postal" },
  { key: "lat", header: "Lat" },
  { key: "lon", header: "Lon" },
];

// Campos string extra (editables desde el modal y también exportables/importables por Excel).
const CAMPOS_EXTRA = ["barrio", "manzana", "lote", "tipoVia", "telefono", "correo", "puntoVenta", "tipo", "vendedor"] as const;

// Encabezado del Excel para cada campo extra (exportar/importar usan el mismo).
const EXTRA_HEADERS: Record<(typeof CAMPOS_EXTRA)[number], string> = {
  barrio: "Barrio",
  manzana: "Manzana",
  lote: "Lote",
  tipoVia: "Tipo de Vía",
  telefono: "Teléfono",
  correo: "Correo",
  puntoVenta: "Punto de Venta",
  tipo: "Tipo",
  vendedor: "Vendedor",
};

interface ClienteRow {
  codigoDireccion: string;
  nombreDireccion: string;
  cliente: string;
  tipoDireccion: string;
  direccion: string;
  referencia: string;
  descripcion: string;
  comuna: string;
  provincia: string;
  region: string;
  pais: string;
  codigoPostal: string;
  lat: string;
  lon: string;
  // Campos extra (opcionales; presentes si el Excel exportado los trae).
  barrio?: string;
  manzana?: string;
  lote?: string;
  tipoVia?: string;
  telefono?: string;
  correo?: string;
  puntoVenta?: string;
  tipo?: string;
  vendedor?: string;
}

// Alias de encabezados aceptados por columna (tolerante a mayúsculas/tildes).
// Incluye los nombres propios de DISTRILOG y los que exporta SIGCOMPRO
// (Nit_Cedula, Nombre, Direccion, Referencia, Barrio, Ciudad, Telefono,
// Punto_venta), para poder importar directamente un Excel exportado de allá.
const ALIASES: Record<string, string[]> = {
  codigoDireccion: ["Código de Dirección", "Codigo de Direccion", "Código", "Codigo", "Nit_Cedula", "Nit Cedula", "Nit/Cedula", "Nit", "Cedula"],
  nombreDireccion: ["Nombre de Dirección", "Nombre de Direccion", "Descripción Sucursal", "Descripcion Sucursal"],
  cliente: ["Cliente", "Nombre", "Nombres", "Razón Social", "Razon Social"],
  tipoDireccion: ["Tipo de Dirección", "Tipo de Direccion"],
  direccion: ["Dirección", "Direccion"],
  referencia: ["Referencia"],
  descripcion: ["Descripción", "Descripcion"],
  comuna: ["Comuna", "Ciudad"],
  provincia: ["Provincia", "Departamento"],
  region: ["Región", "Region"],
  pais: ["País", "Pais"],
  codigoPostal: ["Código Postal", "Codigo Postal"],
  lat: ["Lat", "Latitud"],
  lon: ["Lon", "Lng", "Longitud"],
  barrio: ["Barrio"],
  manzana: ["Manzana"],
  lote: ["Lote"],
  tipoVia: ["Tipo de Vía", "Tipo de Via"],
  telefono: ["Teléfono", "Telefono", "Celular"],
  correo: ["Correo", "Email"],
  puntoVenta: ["Punto de Venta", "Punto_venta", "Puntoventa", "Punto"],
  tipo: ["Tipo"],
  vendedor: ["Vendedor"],
};

// Primera letra de cada palabra en mayúscula (igual que el modal de edición).
// Solo se usa para Nombre/Cliente, Referencia y Barrio; el resto de campos
// (p. ej. Dirección) se importan tal cual para no romper códigos como "5A".
function tituloAuto(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim();
}

// Campos a los que se les aplica automáticamente el título (primera mayúscula).
const CAMPOS_TITULO = new Set(["cliente", "referencia", "barrio"]);

function parseClientes(buffer: Buffer): { rows: ClienteRow[]; presentes: Set<string> } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length < 2) return { rows: [], presentes: new Set() };

  const header = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const key of Object.keys(ALIASES)) {
    const aliases = ALIASES[key].map(norm);
    idx[key] = header.findIndex((h) => aliases.includes(h));
  }
  // Columnas que sí vienen en este Excel (para no tocar en la BD las que no traiga).
  const presentes = new Set(Object.keys(idx).filter((k) => idx[k] >= 0));

  const pick = (r: unknown[], i: number, key: string) => {
    const v = i >= 0 ? String(r[i] ?? "").trim() : "";
    return v && CAMPOS_TITULO.has(key) ? tituloAuto(v) : v;
  };

  const out: ClienteRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row = {} as ClienteRow;
    for (const { key } of CAMPOS) {
      row[key] = pick(r, idx[key], key);
    }
    for (const key of CAMPOS_EXTRA) {
      const v = pick(r, idx[key], key);
      if (v) row[key] = v;
    }
    if (!row.codigoDireccion && !row.nombreDireccion && !row.cliente) continue;
    out.push(row);
  }
  return { rows: out, presentes };
}

// Normaliza para COMPARAR contenido: ignora mayúsculas/minúsculas, tildes y
// espacios repetidos. Así un Excel re-exportado (mismo dato, distinto "casing")
// no se marca como cambiado y no pisa verificaciones ya hechas (lat/lon).
function comparable(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Campos "de contenido" a comparar/actualizar (todo excepto la clave y lat/lon,
// que se manejan aparte). Derivado de CAMPOS/CAMPOS_EXTRA para no duplicar la lista.
const CAMPOS_CONTENIDO = [
  ...CAMPOS.map((c) => c.key).filter((k) => k !== "codigoDireccion" && k !== "lat" && k !== "lon"),
  ...CAMPOS_EXTRA,
] as const;

// GET /api/clientes
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const clientes = await prisma.cliente.findMany({
      orderBy: { cliente: "asc" },
    });
    res.json(
      clientes.map((c) => ({
        ...c,
        consecutivos: c.consecutivos
          ? (JSON.parse(c.consecutivos) as string[])
          : [],
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/auto-consecutivos  -> cruza y asigna consecutivos en lote
router.post("/auto-consecutivos", requireAuth, requirePermiso("/configuracion/clientes"), async (_req, res, next) => {
  try {
    const result = await asignarConsecutivosAuto();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes  -> crea un cliente individual (desde el flujo de órdenes)
router.post("/", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const data: Record<string, string | boolean | null> = {};
    for (const { key } of CAMPOS) {
      const v = body[key];
      data[key] = v == null || v === "" ? null : String(v).trim();
    }
    for (const key of CAMPOS_EXTRA) {
      const v = body[key];
      data[key] = v == null || v === "" ? null : String(v).trim();
    }
    if (typeof body.activo === "boolean") data.activo = body.activo;
    const consecutivos: string[] = Array.isArray(body.consecutivos)
      ? body.consecutivos.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];
    const cliente = await prisma.cliente.create({
      data: { ...data, consecutivos: JSON.stringify(consecutivos) },
    });
    res.status(201).json({ ...cliente, consecutivos });
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/:id/consecutivo  -> asigna un consecutivo a un cliente existente
router.post("/:id/consecutivo", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const nuevo = String(req.body?.consecutivo ?? "").trim();
    if (!nuevo) throw new HttpError(400, "El consecutivo es obligatorio");
    const current = await prisma.cliente.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Cliente no encontrado");
    // Un consecutivo pertenece a un solo cliente: se quita de los demás para que
    // el recién asignado sea el que sobrescribe (prioridad sobre el del Excel).
    const otros = await prisma.cliente.findMany({
      where: { id: { not: id }, consecutivos: { contains: nuevo } },
      select: { id: true, consecutivos: true },
    });
    for (const c of otros) {
      let l: string[] = [];
      try { l = c.consecutivos ? (JSON.parse(c.consecutivos) as string[]) : []; } catch { l = []; }
      const filtrada = l.filter((x) => x.toUpperCase() !== nuevo.toUpperCase());
      if (filtrada.length !== l.length) {
        await prisma.cliente.update({ where: { id: c.id }, data: { consecutivos: JSON.stringify(filtrada) } });
      }
    }
    const lista: string[] = current.consecutivos
      ? (JSON.parse(current.consecutivos) as string[])
      : [];
    if (!lista.some((x) => x.toUpperCase() === nuevo.toUpperCase())) {
      lista.push(nuevo);
    }
    const cliente = await prisma.cliente.update({
      where: { id },
      data: { consecutivos: JSON.stringify(lista) },
    });
    res.json({ ...cliente, consecutivos: lista });
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/import  (multipart, campo "file")
// Importa/actualiza el maestro por UPSERT, igual que Sigcompro: NUNCA borra
// clientes existentes que no vengan en el archivo. Empareja por código de
// dirección (o por nombre si la fila no trae código) y solo compara/actualiza
// las columnas que el Excel realmente trae, ignorando mayúsculas/tildes para
// no marcar como "cambiado" un dato que solo difiere en formato. Acepta tanto
// el formato propio de DISTRILOG como el que exporta Sigcompro (Nit_Cedula,
// Nombre, Direccion, Referencia, Barrio, Ciudad, Telefono, Punto_venta).
router.post(
  "/import",
  requireAuth,
  requirePermiso("/configuracion/clientes"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No se recibió ningún archivo");
      }

      const { rows: filas, presentes } = parseClientes(req.file.buffer);
      if (filas.length === 0) {
        throw new HttpError(
          400,
          "El archivo no contiene clientes válidos (falta Código de Dirección / Nit, Nombre o Cliente)."
        );
      }

      // Clave natural: código de dirección; si la fila no trae código, usa el
      // nombre del cliente (evita duplicar filas sin código al reimportar).
      const clave = (f: { codigoDireccion: string; cliente: string; nombreDireccion: string }): string => {
        const cod = norm(f.codigoDireccion);
        if (cod) return `COD:${cod}`;
        const nombre = norm(f.cliente || f.nombreDireccion);
        return nombre ? `NOM:${nombre}` : "";
      };

      // Deduplica por clave dentro del archivo (gana la última fila).
      const porClave = new Map<string, ClienteRow>();
      let descartadas = 0;
      for (const f of filas) {
        const k = clave(f);
        if (!k) { descartadas++; continue; }
        porClave.set(k, f);
      }

      const existentes = await prisma.cliente.findMany();
      const existentePorClave = new Map<string, (typeof existentes)[number]>();
      for (const c of existentes) {
        const k = clave({ codigoDireccion: c.codigoDireccion ?? "", cliente: c.cliente ?? "", nombreDireccion: c.nombreDireccion ?? "" });
        if (k) existentePorClave.set(k, c);
      }

      let creados = 0;
      let actualizados = 0;
      let sinCambios = 0;

      await prisma.$transaction(async (tx) => {
        for (const [k, f] of porClave) {
          const actual = existentePorClave.get(k);
          if (!actual) {
            // Nuevo cliente: se crea con lo que traiga el archivo.
            const data: Record<string, string | null> = {};
            for (const { key } of CAMPOS) data[key] = f[key] || null;
            for (const key of CAMPOS_EXTRA) data[key] = f[key] || null;
            await tx.cliente.create({ data: { ...data, consecutivos: JSON.stringify([]) } });
            creados++;
            continue;
          }
          // Existente: compara SOLO las columnas que sí vinieron en este Excel;
          // las que el archivo no trae (p. ej. si es un export parcial) no se tocan.
          let difiereContenido = false;
          const data: Record<string, string | null> = {};
          for (const key of CAMPOS_CONTENIDO) {
            if (!presentes.has(key)) continue;
            const nuevo = (f as unknown as Record<string, string | undefined>)[key] ?? "";
            const previo = (actual as unknown as Record<string, string | null>)[key];
            if (comparable(previo) !== comparable(nuevo)) difiereContenido = true;
            data[key] = nuevo || null;
          }
          if (!difiereContenido) { sinCambios++; continue; }
          // El contenido cambió de verdad: limpia lat/lon para marcar "sin
          // verificar" en el mapa (igual que Sigcompro), salvo que el propio
          // archivo ya traiga coordenadas (p. ej. reimportar nuestro export).
          data.lat = presentes.has("lat") ? (f.lat || null) : null;
          data.lon = presentes.has("lon") ? (f.lon || null) : null;
          await tx.cliente.update({ where: { id: actual.id }, data });
          actualizados++;
        }
      });

      res.status(201).json({
        totalFilas: porClave.size,
        creados,
        actualizados,
        sinCambios,
        descartadas,
        importados: creados + actualizados,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/clientes/export  -> descarga TODOS los clientes (Distribución + TAT) en
// un Excel editable con las mismas columnas que acepta el import.
router.get("/export", requireAuth, async (_req, res, next) => {
  try {
    const [clientes, tat] = await Promise.all([
      prisma.cliente.findMany({ orderBy: { cliente: "asc" } }),
      prisma.clienteTat.findMany({ where: { eliminado: false }, orderBy: { razonSocial: "asc" } }),
    ]);
    const headers = [
      ...CAMPOS.map((c) => c.header),
      ...CAMPOS_EXTRA.map((k) => EXTRA_HEADERS[k]),
    ];
    const rows: Record<string, string>[] = [];

    // Clientes de Distribución (tabla Cliente).
    for (const c of clientes) {
      const src = c as Record<string, unknown>;
      const row: Record<string, string> = {};
      for (const { key, header } of CAMPOS) row[header] = (src[key] as string | null) ?? "";
      for (const key of CAMPOS_EXTRA) row[EXTRA_HEADERS[key]] = (src[key] as string | null) ?? "";
      rows.push(row);
    }

    // Clientes TAT (tabla ClienteTat), mapeados a las mismas columnas.
    for (const t of tat) {
      const base = t.codigoTercero ?? t.nit ?? "";
      const suc = parseInt(String(t.sucursal ?? "").trim(), 10);
      const codigo = base && Number.isFinite(suc) ? `${base}-${suc}` : base;
      rows.push({
        [CAMPOS[0].header]: codigo,                               // Código de Dirección
        [CAMPOS[1].header]: t.descripcionSucursal ?? t.razonSocial ?? "", // Nombre de Dirección
        [CAMPOS[2].header]: t.razonSocial ?? "",                 // Cliente
        [CAMPOS[3].header]: "",                                   // Tipo de Dirección
        [CAMPOS[4].header]: t.direccion1 ?? "",                  // Dirección
        [CAMPOS[5].header]: t.referencia ?? "",                  // Referencia
        [CAMPOS[6].header]: t.descripcionSucursal ?? "",         // Descripción
        [CAMPOS[7].header]: t.ciudad ?? "",                      // Comuna
        [CAMPOS[8].header]: t.departamento ?? "",               // Provincia
        [CAMPOS[9].header]: "",                                   // Región
        [CAMPOS[10].header]: t.pais ?? "",                      // País
        [CAMPOS[11].header]: "",                                  // Código Postal
        [CAMPOS[12].header]: t.lat ?? "",                        // Lat
        [CAMPOS[13].header]: t.lon ?? "",                        // Lon
        [EXTRA_HEADERS.barrio]: t.barrio ?? "",
        [EXTRA_HEADERS.manzana]: t.manzana ?? "",
        [EXTRA_HEADERS.lote]: t.lote ?? "",
        [EXTRA_HEADERS.tipoVia]: t.tipoVia ?? "",
        [EXTRA_HEADERS.telefono]: t.telefono ?? t.celular ?? "",
        [EXTRA_HEADERS.correo]: t.correo ?? "",
        [EXTRA_HEADERS.puntoVenta]: t.puntoVenta ?? "",
        [EXTRA_HEADERS.tipo]: t.tipo ?? "TAT",
        [EXTRA_HEADERS.vendedor]: t.vendedor ?? "",
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    // Si no hay clientes, deja al menos la fila de encabezados como plantilla.
    if (rows.length === 0) XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="clientes-distrilog-${fecha}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// PUT /api/clientes/:id  -> actualiza los campos editables
router.put("/:id", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const body = req.body ?? {};
    const data: Record<string, string | boolean | null> = {};
    for (const { key } of CAMPOS) {
      if (key in body) {
        const v = body[key];
        data[key] = v == null || v === "" ? null : String(v).trim();
      }
    }
    for (const key of CAMPOS_EXTRA) {
      if (key in body) {
        const v = body[key];
        data[key] = v == null || v === "" ? null : String(v).trim();
      }
    }
    if (typeof body.activo === "boolean") data.activo = body.activo;
    if (Array.isArray(body.consecutivos)) {
      data.consecutivos = JSON.stringify(
        body.consecutivos.map((s: unknown) => String(s).trim()).filter(Boolean)
      );
    }

    const current = await prisma.cliente.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "Cliente no encontrado");
    }

    const cliente = await prisma.cliente.update({ where: { id }, data });
    res.json({
      ...cliente,
      consecutivos: cliente.consecutivos
        ? (JSON.parse(cliente.consecutivos) as string[])
        : [],
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clientes  -> borra TODO el maestro de clientes (solo administradores)
router.delete("/", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN" && req.user?.role !== "DEVELOPER") {
      throw new HttpError(403, "Eliminar todos los clientes requiere rol administrador");
    }
    const { count } = await prisma.cliente.deleteMany();
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

export default router;
