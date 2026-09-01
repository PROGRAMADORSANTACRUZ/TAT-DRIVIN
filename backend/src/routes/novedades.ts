import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

const novedadSchema = z.object({
  fecha: z.string().trim().min(1).optional(),
  tipo: z.string().trim().optional().default(""),
  prioridad: z.enum(["Alta", "Media", "Baja"]).default("Media"),
  estado: z.enum(["Pendiente", "En proceso", "Resuelta"]).default("Pendiente"),
  estadoEntrega: z.enum(["Sin Novedad", "Con Novedad", "Doc.Pendiente", "Reenvio", "Rechazado", "Parcial Con Novedad"]).default("Sin Novedad"),
  novedad: z.string().trim().optional().nullable(),
  responsabilidad: z.string().trim().optional().nullable(),
  noLlego: z.string().optional().nullable(),
  planillaId: z.string().trim().optional().nullable(),
  placa: z.string().trim().optional().nullable(),
  conductor: z.string().trim().optional().nullable(),
  auxiliarRuta: z.string().trim().optional().nullable(),
  cliente: z.string().trim().optional().nullable(),
  numeroOrden: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().optional().default(""),
  resolucion: z.string().trim().optional().nullable(),
});

const patchSchema = novedadSchema.partial();

// GET /api/novedades — soporta ?planillaId=xxx para filtrar
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { planillaId } = req.query;
    const novedades = await prisma.novedad.findMany({
      where: planillaId ? { planillaId: String(planillaId) } : undefined,
      orderBy: { consecutivo: "desc" },
    });
    res.json(novedades);
  } catch (err) {
    next(err);
  }
});

// POST /api/novedades
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = novedadSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const d = parsed.data;
    const last = await prisma.novedad.findFirst({
      orderBy: { consecutivo: "desc" },
      select: { consecutivo: true },
    });
    const novedad = await prisma.novedad.create({
      data: {
        consecutivo: (last?.consecutivo ?? 0) + 1,
        fecha: d.fecha ?? new Date().toISOString().slice(0, 10),
        tipo: d.tipo ?? "",
        prioridad: d.prioridad,
        estado: d.estado,
        estadoEntrega: d.estadoEntrega,
        novedad: d.novedad ?? null,
        responsabilidad: d.responsabilidad ?? null,
        noLlego: d.noLlego ?? null,
        planillaId: d.planillaId ?? null,
        placa: d.placa ?? null,
        conductor: d.conductor ?? null,
        auxiliarRuta: d.auxiliarRuta ?? null,
        cliente: d.cliente ?? null,
        numeroOrden: d.numeroOrden ?? null,
        descripcion: d.descripcion ?? "",
        resolucion: d.resolucion ?? null,
        resueltaAt: d.estado === "Resuelta" ? new Date() : null,
      },
    });
    res.status(201).json(novedad);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/novedades/:id
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const d = parsed.data;
    const existe = await prisma.novedad.findUnique({ where: { id } });
    if (!existe) throw new HttpError(404, "Novedad no encontrada");

    const data: Record<string, unknown> = {};
    if (d.fecha !== undefined) data.fecha = d.fecha;
    if (d.tipo !== undefined) data.tipo = d.tipo ?? "";
    if (d.prioridad !== undefined) data.prioridad = d.prioridad;
    if (d.estadoEntrega !== undefined) data.estadoEntrega = d.estadoEntrega;
    if (d.novedad !== undefined) data.novedad = d.novedad ?? null;
    if (d.responsabilidad !== undefined) data.responsabilidad = d.responsabilidad ?? null;
    if (d.noLlego !== undefined) data.noLlego = d.noLlego ?? null;
    if (d.planillaId !== undefined) data.planillaId = d.planillaId ?? null;
    if (d.placa !== undefined) data.placa = d.placa ?? null;
    if (d.conductor !== undefined) data.conductor = d.conductor ?? null;
    if (d.auxiliarRuta !== undefined) data.auxiliarRuta = d.auxiliarRuta ?? null;
    if (d.cliente !== undefined) data.cliente = d.cliente ?? null;
    if (d.numeroOrden !== undefined) data.numeroOrden = d.numeroOrden ?? null;
    if (d.descripcion !== undefined) data.descripcion = d.descripcion ?? "";
    if (d.resolucion !== undefined) data.resolucion = d.resolucion ?? null;
    if (d.estado !== undefined) {
      data.estado = d.estado;
      data.resueltaAt = d.estado === "Resuelta" ? existe.resueltaAt ?? new Date() : null;
    }

    const novedad = await prisma.novedad.update({ where: { id }, data });
    res.json(novedad);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/novedades/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await prisma.novedad.delete({ where: { id: String(req.params.id) } });
    res.json({ eliminado: true });
  } catch (err) {
    next(err);
  }
});

export default router;
