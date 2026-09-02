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
  crearClienteDrivin,
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

// Campos string extra (editables desde el modal, no vienen del Excel).
const CAMPOS_EXTRA = ["barrio", "manzana", "lote", "tipoVia", "telefono", "correo", "puntoVenta", "tipo"] as const;

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
}

function parseClientes(buffer: Buffer): ClienteRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length < 2) return [];

  const header = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const { key, header: label } of CAMPOS) {
    idx[key] = header.findIndex((h) => h === norm(label));
  }

  const pick = (r: unknown[], i: number) =>
    i >= 0 ? String(r[i] ?? "").trim() : "";

  const out: ClienteRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row = {} as ClienteRow;
    for (const { key } of CAMPOS) {
      row[key] = pick(r, idx[key]);
    }
    if (!row.codigoDireccion && !row.nombreDireccion && !row.cliente) continue;
    out.push(row);
  }
  return out;
}

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
    // Registra el cliente en Drivin (best-effort) para que exista antes de que
    // salga la orden. No bloquea la creación local si Drivin falla.
    const drivin = await crearClienteDrivin({
      code: cliente.codigoDireccion,
      name: cliente.cliente ?? cliente.nombreDireccion,
      contactName: cliente.cliente ?? cliente.nombreDireccion,
      contactPhone: cliente.telefono,
      contactEmail: cliente.correo,
    });
    res.status(201).json({ ...cliente, consecutivos, drivin });
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

      const clientes = parseClientes(req.file.buffer);
      if (clientes.length === 0) {
        throw new HttpError(400, "El archivo no contiene clientes válidos");
      }

      await prisma.$transaction([
        prisma.cliente.deleteMany(),
        prisma.cliente.createMany({ data: clientes }),
      ]);

      res.status(201).json({ importados: clientes.length });
    } catch (err) {
      next(err);
    }
  }
);

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
