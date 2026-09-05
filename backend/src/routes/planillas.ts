import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";

const router = Router();

const itemSchema = z.object({
  numeroOrden: z.string(),
  cliente: z.string().optional().default(""),
  destino: z.string().optional().default(""),
  area: z.string().optional().default(""),
  codigoArea: z.string().optional().default(""),
  nombreDestino: z.string().optional().default(""),
  direccion: z.string().optional().default(""),
  kg: z.coerce.number().default(0),
});

const planillaSchema = z.object({
  fecha: z.string().trim().min(1, "La fecha es obligatoria"),
  placa: z.string().trim().min(1, "La placa es obligatoria"),
  conductor: z.string().trim().optional().nullable(),
  origen: z.string().trim().optional().nullable(),
  horaSalida: z.string().trim().optional().nullable(),
  auxiliarRuta: z.string().trim().optional().nullable(),
  tipoDespacho: z.string().trim().optional().nullable(),
  ruta: z.string().trim().optional().nullable(),
  docs: z.coerce.number().int().min(0).default(0),
  kilos: z.coerce.number().min(0).default(0),
  clientes: z.array(z.string()).optional().default([]),
  items: z.array(itemSchema).optional().default([]),
});

const patchSchema = z.object({
  placa: z.string().trim().optional(),
  conductor: z.string().trim().optional().nullable(),
  auxiliarRuta: z.string().trim().optional().nullable(),
  ruta: z.string().trim().optional().nullable(),
  tipoDespacho: z.string().trim().optional().nullable(),
  horaSalida: z.string().trim().optional().nullable(),
  items: z.array(itemSchema).optional(),
  anulada: z.boolean().optional(),
  impresa: z.boolean().optional(),
});

// Datos opcionales de la nueva planilla al anular (override).
const anularSchema = z.object({
  placa: z.string().trim().optional(),
  conductor: z.string().trim().optional().nullable(),
  auxiliarRuta: z.string().trim().optional().nullable(),
  ruta: z.string().trim().optional().nullable(),
  tipoDespacho: z.string().trim().optional().nullable(),
  items: z.array(itemSchema).optional(),
  clientes: z.array(z.string()).optional(),
});

type Item = z.infer<typeof itemSchema>;

function parseItems(raw: string | null): Item[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

// GET /api/planillas  -> historial de plantillas generadas
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const planillas = await prisma.planillaDespacho.findMany({
      orderBy: { consecutivo: "desc" },
    });
    res.json(
      planillas.map((p) => ({
        ...p,
        clientes: p.clientes ? (JSON.parse(p.clientes) as string[]) : [],
        items: parseItems(p.items),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/planillas  -> crea una planilla y asigna consecutivo
router.post("/", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    const parsed = planillaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }
    const d = parsed.data;
    // Lock de consecutivo (evita duplicados bajo concurrencia).
    const planilla = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1001)`;
      const last = await tx.planillaDespacho.findFirst({
        orderBy: { consecutivo: "desc" },
        select: { consecutivo: true },
      });
      const consecutivo = (last?.consecutivo ?? 0) + 1;
      return tx.planillaDespacho.create({
        data: {
          consecutivo,
          fecha: d.fecha,
          placa: d.placa,
          conductor: d.conductor ?? null,
          origen: d.origen ?? null,
          horaSalida: d.horaSalida ?? null,
          auxiliarRuta: d.auxiliarRuta ?? null,
          tipoDespacho: d.tipoDespacho ?? null,
          ruta: d.ruta ?? null,
          docs: d.docs,
          kilos: d.kilos,
          clientes: JSON.stringify(d.clientes ?? []),
          items: JSON.stringify(d.items ?? []),
        },
      });
    });

    // Si alguna remisión de esta planilla ya se había enviado al Nivel de Servicio
    // manualmente (sin DL), se le asigna ahora el DL de esta planilla (no duplica).
    const numerosItems = (d.items ?? [])
      .map((it) => it.numeroOrden)
      .filter((n): n is string => Boolean(n));
    if (numerosItems.length > 0) {
      await prisma.novedad.updateMany({
        where: { numeroOrden: { in: numerosItems }, planillaId: null },
        data: {
          planillaId: planilla.id,
          placa: planilla.placa,
          conductor: planilla.conductor,
          auxiliarRuta: planilla.auxiliarRuta,
          fecha: planilla.fecha,
        },
      });
    }

    res.status(201).json({
      ...planilla,
      clientes: d.clientes ?? [],
      items: d.items ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/planillas/:id  -> edita cabecera e items (recalcula docs/kilos)
router.patch("/:id", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }
    const d = parsed.data;
    const data: Record<string, unknown> = {};
    if (d.placa !== undefined) data.placa = d.placa;
    if (d.conductor !== undefined) data.conductor = d.conductor ?? null;
    if (d.auxiliarRuta !== undefined) data.auxiliarRuta = d.auxiliarRuta ?? null;
    if (d.ruta !== undefined) data.ruta = d.ruta ?? null;
    if (d.tipoDespacho !== undefined) data.tipoDespacho = d.tipoDespacho ?? null;
    if (d.horaSalida !== undefined) data.horaSalida = d.horaSalida ?? null;
    if (d.anulada !== undefined) {
      data.anulada = d.anulada;
      data.anuladaAt = d.anulada ? new Date() : null;
    }
    if (d.impresa !== undefined) {
      data.impresa = d.impresa;
      // Al imprimir se sella la fecha; al desmarcar NO se borra (permite distinguir "reimpresión").
      if (d.impresa) data.impresaAt = new Date();
    }
    if (d.items !== undefined) {
      const items = d.items;
      data.items = JSON.stringify(items);
      data.docs = new Set(items.map((i) => i.numeroOrden)).size;
      data.kilos = items.reduce((s, i) => s + i.kg, 0);
    }

    const planilla = await prisma.planillaDespacho.update({ where: { id }, data });
    res.json({
      ...planilla,
      clientes: planilla.clientes ? (JSON.parse(planilla.clientes) as string[]) : [],
      items: parseItems(planilla.items),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/planillas/:id
router.delete("/:id", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    await prisma.planillaDespacho.delete({ where: { id: String(req.params.id) } });
    res.json({ eliminado: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/planillas/:id/anular — anula la planilla actual y crea una nueva copia con nuevo consecutivo.
// Acepta un body opcional con los datos NUEVOS (placa, conductor, auxiliarRuta, ruta, tipoDespacho, items)
// para reflejar el cambio en la planilla nueva; la original queda intacta salvo la marca de anulada.
router.post("/:id/anular", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const original = await prisma.planillaDespacho.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Planilla no encontrada");

    const parsed = anularSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const b = parsed.data;

    // Datos de la nueva planilla: override si viene, si no los de la original.
    let itemsStr = original.items;
    let docs = original.docs;
    let kilos = original.kilos;
    let clientesStr = original.clientes;
    if (Array.isArray(b.items)) {
      itemsStr = JSON.stringify(b.items);
      docs = new Set(b.items.map((i) => i.numeroOrden)).size;
      kilos = b.items.reduce((s, i) => s + (Number(i.kg) || 0), 0);
      if (Array.isArray(b.clientes)) clientesStr = JSON.stringify(b.clientes);
    }

    // Anula la original y crea la nueva de forma atómica con lock de consecutivo.
    const nueva = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1001)`;
      await tx.planillaDespacho.update({
        where: { id },
        data: { anulada: true, anuladaAt: new Date() },
      });
      const last = await tx.planillaDespacho.findFirst({
        orderBy: { consecutivo: "desc" },
        select: { consecutivo: true },
      });
      const nuevaConsecutivo = (last?.consecutivo ?? 0) + 1;
      const creada = await tx.planillaDespacho.create({
        data: {
          consecutivo: nuevaConsecutivo,
          fecha: original.fecha,
          placa: b.placa?.trim() ? b.placa.trim() : original.placa,
          conductor: b.conductor !== undefined ? (b.conductor ?? null) : original.conductor,
          origen: original.origen,
          horaSalida: original.horaSalida,
          auxiliarRuta: b.auxiliarRuta !== undefined ? (b.auxiliarRuta ?? null) : original.auxiliarRuta,
          tipoDespacho: b.tipoDespacho !== undefined ? (b.tipoDespacho ?? null) : original.tipoDespacho,
          ruta: b.ruta !== undefined ? (b.ruta ?? null) : original.ruta,
          docs,
          kilos,
          clientes: clientesStr,
          items: itemsStr,
          reemplazaDeConsecutivo: original.consecutivo,
        },
      });
      await tx.planillaDespacho.update({
        where: { id },
        data: { reemplazadaPorConsecutivo: nuevaConsecutivo },
      });
      return creada;
    });

    res.status(201).json({
      anulada: { ...original, anulada: true },
      nueva: {
        ...nueva,
        clientes: nueva.clientes ? (JSON.parse(nueva.clientes) as string[]) : [],
        items: parseItems(nueva.items),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
