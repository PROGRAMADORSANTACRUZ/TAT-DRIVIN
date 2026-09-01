import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { AUXILIARES_DEFAULT, RUTAS_DEFAULT, PLAN_NOMBRES_DEFAULT } from "../data/configDefaults";

const router = Router();

// ── Auxiliares ───────────────────────────────────────────────────────────────
const auxiliarSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().optional().nullable(),
});

router.get("/auxiliares", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.auxiliar.createMany({
        data: AUXILIARES_DEFAULT.map((a, i) => ({ nombre: a.nombre, telefono: a.telefono ?? null, orden: i })),
      });
      items = await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// Reemplaza toda la lista de auxiliares con la enviada.
router.put("/auxiliares", requireAuth, requirePermiso("/configuracion/conductores"), async (req, res, next) => {
  try {
    const parsed = z.array(auxiliarSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de auxiliares inválidos");
    await prisma.$transaction([
      prisma.auxiliar.deleteMany(),
      prisma.auxiliar.createMany({
        data: parsed.data.map((a, i) => ({ nombre: a.nombre, telefono: a.telefono ?? null, orden: i })),
      }),
    ]);
    res.json(await prisma.auxiliar.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Rutas ────────────────────────────────────────────────────────────────────
const rutaSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  recorrido: z.string().trim().optional().nullable(),
  ciudad: z.string().trim().optional().nullable(),
  kls: z.coerce.number().optional().nullable(),
  tiempo: z.string().trim().optional().nullable(),
  grupo: z.string().trim().optional().nullable(),
});

router.get("/rutas", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.ruta.createMany({
        data: RUTAS_DEFAULT.map((r, i) => ({
          nombre: r.nombre, recorrido: r.recorrido ?? null, ciudad: r.ciudad ?? null,
          kls: r.kls ?? null, tiempo: r.tiempo ?? null, grupo: r.grupo ?? null, orden: i,
        })),
      });
      items = await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.put("/rutas", requireAuth, requirePermiso("/configuracion/rutas"), async (req, res, next) => {
  try {
    const parsed = z.array(rutaSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de rutas inválidos");
    await prisma.$transaction([
      prisma.ruta.deleteMany(),
      prisma.ruta.createMany({
        data: parsed.data.map((r, i) => ({
          nombre: r.nombre, recorrido: r.recorrido ?? null, ciudad: r.ciudad ?? null,
          kls: r.kls ?? null, tiempo: r.tiempo ?? null, grupo: r.grupo ?? null, orden: i,
        })),
      }),
    ]);
    res.json(await prisma.ruta.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Nombres de planes ────────────────────────────────────────────────────────
const planNombreSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1),
  tipo: z.string().trim().optional().nullable(),
});

router.get("/plan-nombres", requireAuth, async (_req, res, next) => {
  try {
    let items = await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    if (items.length === 0) {
      await prisma.planNombre.createMany({
        data: PLAN_NOMBRES_DEFAULT.map((p, i) => ({ nombre: p.nombre, tipo: p.tipo ?? null, orden: i })),
      });
      items = await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
    }
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.put("/plan-nombres", requireAuth, requirePermiso("/configuracion/plan-nombres"), async (req, res, next) => {
  try {
    const parsed = z.array(planNombreSchema).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos de nombres de planes inválidos");
    await prisma.$transaction([
      prisma.planNombre.deleteMany(),
      prisma.planNombre.createMany({
        data: parsed.data.map((p, i) => ({ nombre: p.nombre, tipo: p.tipo ?? null, orden: i })),
      }),
    ]);
    res.json(await prisma.planNombre.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
  } catch (err) {
    next(err);
  }
});

// ── Registro de cambios de despacho ──────────────────────────────────────────
const cambioSchema = z.object({
  tipo: z.enum(["movimiento", "anulacion", "reimpresion", "liberacion"]),
  remision: z.string().trim().optional().nullable(),
  deVehiculo: z.string().trim().optional().nullable(),
  aVehiculo: z.string().trim().optional().nullable(),
  dlOrigen: z.coerce.number().int().optional().nullable(),
  dlNuevo: z.coerce.number().int().optional().nullable(),
  detalle: z.string().trim().optional().nullable(),
});

router.get("/cambios", requireAuth, async (_req, res, next) => {
  try {
    res.json(await prisma.cambioDespacho.findMany({ orderBy: { createdAt: "desc" }, take: 500 }));
  } catch (err) {
    next(err);
  }
});

router.post("/cambios", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    const parsed = cambioSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const c = await prisma.cambioDespacho.create({
      data: {
        tipo: parsed.data.tipo,
        remision: parsed.data.remision ?? null,
        deVehiculo: parsed.data.deVehiculo ?? null,
        aVehiculo: parsed.data.aVehiculo ?? null,
        dlOrigen: parsed.data.dlOrigen ?? null,
        dlNuevo: parsed.data.dlNuevo ?? null,
        detalle: parsed.data.detalle ?? null,
      },
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
});

router.patch("/cambios/:id", requireAuth, requirePermiso("/planificacion-dl"), async (req, res, next) => {
  try {
    const hecho = req.body?.hecho;
    if (typeof hecho !== "boolean") throw new HttpError(400, "El campo 'hecho' debe ser booleano");
    const c = await prisma.cambioDespacho.update({ where: { id: String(req.params.id) }, data: { hecho } });
    res.json(c);
  } catch (err) {
    next(err);
  }
});

// Elimina los cambios ya marcados como hechos.
router.delete("/cambios/hechos", requireAuth, requirePermiso("/planificacion-dl"), async (_req, res, next) => {
  try {
    const { count } = await prisma.cambioDespacho.deleteMany({ where: { hecho: true } });
    res.json({ eliminados: count });
  } catch (err) {
    next(err);
  }
});

export default router;
