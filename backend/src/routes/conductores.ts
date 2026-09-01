import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";

import { env } from "../config/env";

const router = Router();

const conductorSchema = z.object({
  nombres: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  apellidos: z.string().trim().min(1, "El apellido es obligatorio").max(100),
  cedula: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, "La cédula debe contener solo números (6 a 15 dígitos)"),
  correo: z
    .string()
    .trim()
    .email("Correo inválido")
    .max(255)
    .optional()
    .or(z.literal("")),
  celular: z.string().trim().max(20).optional().or(z.literal("")),
  perfil: z.string().trim().max(100).optional(),
  depositos: z.string().trim().max(200).optional().or(z.literal("")),
  clientes: z.string().trim().optional().or(z.literal("")),
  activo: z.boolean().optional(),
});

function normalize(data: z.infer<typeof conductorSchema>) {
  return {
    nombres: data.nombres,
    apellidos: data.apellidos,
    cedula: data.cedula,
    correo: data.correo ? data.correo : null,
    celular: data.celular ? data.celular : null,
    perfil: data.perfil && data.perfil.length ? data.perfil : "Conductor",
    depositos: data.depositos ? data.depositos : null,
    clientes: data.clientes ? data.clientes : null,
    activo: data.activo ?? true,
  };
}

// GET /api/conductores
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const conductores = await prisma.conductor.findMany({
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    });
    res.json(conductores);
  } catch (err) {
    next(err);
  }
});

// POST /api/conductores
router.post("/", requireAuth, requirePermiso("/configuracion/conductores"), async (req, res, next) => {
  try {
    const parsed = conductorSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const existing = await prisma.conductor.findUnique({
      where: { cedula: parsed.data.cedula },
    });
    if (existing) {
      throw new HttpError(409, "Ya existe un conductor con esa cédula");
    }

    const conductor = await prisma.conductor.create({
      data: normalize(parsed.data),
    });
    res.status(201).json(conductor);
  } catch (err) {
    next(err);
  }
});

// PUT /api/conductores/:id
router.put("/:id", requireAuth, requirePermiso("/configuracion/conductores"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const parsed = conductorSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const current = await prisma.conductor.findUnique({
      where: { id },
    });
    if (!current) {
      throw new HttpError(404, "Conductor no encontrado");
    }

    const duplicate = await prisma.conductor.findFirst({
      where: { cedula: parsed.data.cedula, id: { not: id } },
    });
    if (duplicate) {
      throw new HttpError(409, "Ya existe un conductor con esa cédula");
    }

    const conductor = await prisma.conductor.update({
      where: { id },
      data: normalize(parsed.data),
    });
    res.json(conductor);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/conductores/:id/estado  { activo }
router.patch("/:id/estado", requireAuth, requirePermiso("/configuracion/conductores"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const activo = req.body?.activo;
    if (typeof activo !== "boolean") {
      throw new HttpError(400, "El campo 'activo' debe ser booleano");
    }

    const current = await prisma.conductor.findUnique({
      where: { id },
    });
    if (!current) {
      throw new HttpError(404, "Conductor no encontrado");
    }

    const conductor = await prisma.conductor.update({
      where: { id },
      data: { activo },
    });
    res.json(conductor);
  } catch (err) {
    next(err);
  }
});

// POST /api/conductores/sync  -> importa conductores desde el endpoint de drivers de Drivin
router.post("/sync", requireAuth, requirePermiso("/configuracion/conductores"), async (_req, res, next) => {
  try {
    if (!env.DRIVIN_API_KEY) throw new HttpError(500, "Falta DRIVIN_API_KEY");

    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/users?role_name=driver`, {
      headers: { "X-API-Key": env.DRIVIN_API_KEY },
    });
    if (!resp.ok) throw new HttpError(502, `Drivin respondió ${resp.status}`);

    const data = (await resp.json()) as {
      response?: {
        first_name?: string | null;
        last_name?: string | null;
        dni?: string | null;
        email?: string | null;
        phone?: string | null;
        profile?: string | null;
        employer_name?: string | null;
        fleets?: string | null;
        is_active?: boolean;
      }[];
    };

    let creados = 0;
    let actualizados = 0;

    // Precarga todos los conductores una sola vez y arma índices en memoria (evita N+1).
    const existentes = await prisma.conductor.findMany();
    const porCorreo = new Map<string, (typeof existentes)[number]>();
    const porCedula = new Map<string, (typeof existentes)[number]>();
    const porNombre = new Map<string, (typeof existentes)[number]>();
    for (const c of existentes) {
      if (c.correo) porCorreo.set(c.correo.toLowerCase(), c);
      if (c.cedula) porCedula.set(c.cedula, c);
      porNombre.set(`${c.nombres}||${c.apellidos}`.toLowerCase(), c);
    }

    const nuevos: { nombres: string; apellidos: string; correo: string | null; celular: string | null; perfil: string; depositos: string | null; clientes: string | null; activo: boolean; cedula: string | null }[] = [];

    for (const d of data.response ?? []) {
      const cedula = d.dni?.trim() || null;
      const correo = d.email?.trim() || null;
      const nombres = d.first_name?.trim() ?? "";
      const apellidos = d.last_name?.trim() ?? "";

      // Sin cédula ni correo ni nombre no hay forma de identificar al conductor.
      if (!cedula && !correo && !nombres && !apellidos) continue;

      const datos = {
        nombres,
        apellidos,
        correo,
        celular: d.phone?.trim() || null,
        perfil: d.profile?.trim() || "Conductor",
        depositos: d.employer_name?.trim() || null,
        clientes: d.fleets?.trim() || null,
        activo: d.is_active ?? true,
      };

      // La llave de relación es el correo. Orden: correo -> cédula -> nombre+apellido.
      let exists = correo ? porCorreo.get(correo.toLowerCase()) : undefined;
      if (!exists && cedula) exists = porCedula.get(cedula);
      if (!exists && !correo && !cedula) {
        exists = porNombre.get(`${nombres}||${apellidos}`.toLowerCase());
      }

      if (exists) {
        await prisma.conductor.update({
          where: { id: exists.id },
          data: { ...datos, cedula: cedula ?? exists.cedula },
        });
        actualizados++;
      } else {
        nuevos.push({ ...datos, cedula });
        // Evita duplicados dentro del mismo lote entrante.
        if (correo) porCorreo.set(correo.toLowerCase(), { ...datos, cedula } as (typeof existentes)[number]);
        if (cedula) porCedula.set(cedula, { ...datos, cedula } as (typeof existentes)[number]);
        creados++;
      }
    }

    if (nuevos.length) {
      await prisma.conductor.createMany({ data: nuevos });
    }

    res.status(201).json({
      total: data.response?.length ?? 0,
      creados,
      actualizados,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/conductores/:id
router.delete("/:id", requireAuth, requirePermiso("/configuracion/conductores"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const current = await prisma.conductor.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "Conductor no encontrado");
    }
    await prisma.conductor.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
