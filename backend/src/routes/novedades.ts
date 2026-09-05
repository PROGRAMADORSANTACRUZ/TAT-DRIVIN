import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";

const router = Router();

const novedadSchema = z.object({
  fecha: z.string().trim().min(1).optional(),
  tipo: z.string().trim().optional().default(""),
  prioridad: z.enum(["Alta", "Media", "Baja"]).default("Media"),
  estado: z.enum(["Pendiente", "En tramitación", "Resuelto", "Cerrada"]).default("Pendiente"),
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
router.post("/", requireAuth, requirePermiso("/nivel-de-servicio"), async (req, res, next) => {
  try {
    const parsed = novedadSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const d = parsed.data;
    const novedad = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1002)`;
      const last = await tx.novedad.findFirst({
        orderBy: { consecutivo: "desc" },
        select: { consecutivo: true },
      });
      return tx.novedad.create({
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
          resueltaAt: d.estado === "Resuelto" || d.estado === "Cerrada" ? new Date() : null,
        },
      });
    });
    res.status(201).json(novedad);
  } catch (err) {
    next(err);
  }
});

// POST /api/novedades/enviar-nivel — envía remisiones (con vehículo asignado) al
// Nivel de Servicio sin generar DL. No duplica: si la remisión ya está en el
// Nivel (por numeroOrden) se omite. El código DL-xxxx se asigna después, cuando
// la remisión pasa por Planificación DL (ver planillas.ts POST).
const enviarNivelSchema = z.object({
  numerosOrden: z.array(z.string().trim().min(1)).min(1, "Selecciona al menos una remisión"),
});
router.post("/enviar-nivel", requireAuth, requirePermiso("/nivel-de-servicio"), async (req, res, next) => {
  try {
    const parsed = enviarNivelSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const numeros = [...new Set(parsed.data.numerosOrden)];

    // Remisiones asignadas a un vehículo (una fila por producto → se agrupan).
    const ordenes = await prisma.orden.findMany({
      where: { numeroOrden: { in: numeros }, asignadoVehiculo: { not: null } },
    });
    const porOrden = new Map<string, (typeof ordenes)[number]>();
    for (const o of ordenes) if (!porOrden.has(o.numeroOrden)) porOrden.set(o.numeroOrden, o);

    // Ya existentes en el Nivel (por numeroOrden) para no duplicar.
    const yaExisten = await prisma.novedad.findMany({
      where: { numeroOrden: { in: numeros } },
      select: { numeroOrden: true },
    });
    const existentes = new Set(yaExisten.map((n) => n.numeroOrden));

    const aCrear = [...porOrden.values()].filter((o) => !existentes.has(o.numeroOrden));
    let creadas = 0;
    if (aCrear.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1002)`;
        const last = await tx.novedad.findFirst({
          orderBy: { consecutivo: "desc" },
          select: { consecutivo: true },
        });
        let cons = last?.consecutivo ?? 0;
        for (const o of aCrear) {
          cons += 1;
          // La orden guarda fecha en DD/MM/YYYY; el Nivel filtra por ISO.
          const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(o.fecha ?? "");
          const fechaISO = m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
          await tx.novedad.create({
            data: {
              consecutivo: cons,
              fecha: fechaISO,
              estadoEntrega: "Sin Novedad",
              planillaId: null, // sin DL hasta que pase por Planificación
              placa: o.asignadoVehiculo,
              cliente: o.cliente,
              numeroOrden: o.numeroOrden,
            },
          });
          creadas += 1;
        }
      });
    }
    res.status(201).json({ creadas, omitidas: numeros.length - creadas });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/novedades/:id
router.patch("/:id", requireAuth, requirePermiso("/nivel-de-servicio"), async (req, res, next) => {
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
      data.resueltaAt = d.estado === "Resuelto" || d.estado === "Cerrada" ? existe.resueltaAt ?? new Date() : null;
    }

    const novedad = await prisma.novedad.update({ where: { id }, data });
    res.json(novedad);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/novedades/:id
router.delete("/:id", requireAuth, requirePermiso("/nivel-de-servicio"), async (req, res, next) => {
  try {
    await prisma.novedad.delete({ where: { id: String(req.params.id) } });
    res.json({ eliminado: true });
  } catch (err) {
    next(err);
  }
});

export default router;
