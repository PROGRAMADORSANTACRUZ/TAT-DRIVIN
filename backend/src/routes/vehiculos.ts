import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();

const vehiculoSchema = z.object({
  placa: z
    .string()
    .trim()
    .min(3, "La placa es obligatoria")
    .max(10, "Placa demasiado larga")
    .transform((v) => v.toUpperCase()),
  modelo: z.string().trim().optional(),
  anio: z.coerce.number().int().min(1900).max(2100).optional(),
  horaInicioJornada: z.string().trim().optional(),
  horaFinJornada: z.string().trim().optional(),
  caracteristica: z.string().trim().optional(),
  capacidad: z.string().trim().optional(),
  empleadores: z.string().trim().optional(),
  flotas: z.string().trim().optional(),
  estado: z.string().trim().optional(),
});

interface DrivinVehicle {
  id?: number;
  code?: string | null;
  model?: string | null;
  year?: number | null;
  shift_start?: string | null;
  shift_end?: string | null;
  description?: string | null;
  detail?: string | null;
  vehicle_type?: string | null;
  capacity_1?: number | null;
  employer_name?: string | null;
  employer_code?: string | null;
  fleets?: string | null;
  is_active?: boolean;
  driver?: {
    first_name?: string | null;
    last_name?: string | null;
    dni?: string | null;
  } | null;
}

// Extrae "HH:mm" de una fecha ISO sin ajustar zona horaria.
function toTime(iso?: string | null): string | null {
  return typeof iso === "string" && iso.length >= 16 ? iso.substring(11, 16) : null;
}

// Convierte a "Título": primera letra de cada palabra en mayúscula, resto en minúscula.
function titleCase(value?: string | null): string | null {
  if (!value) return null;
  const formatted = value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return formatted || null;
}

function mapVehiculo(v: DrivinVehicle) {
  const conductor = v.driver
    ? [v.driver.first_name, v.driver.last_name].filter(Boolean).join(" ").trim()
    : null;

  return {
    id: v.id != null ? String(v.id) : crypto.randomUUID(),
    placa: v.code ?? "",
    modelo: titleCase(v.model),
    anio: v.year ?? null,
    horaInicioJornada: toTime(v.shift_start),
    horaFinJornada: toTime(v.shift_end),
    caracteristica: titleCase(v.description ?? v.detail ?? v.vehicle_type),
    capacidad: v.capacity_1 != null ? String(v.capacity_1) : null,
    empleadores: titleCase(v.employer_name ?? v.employer_code),
    flotas: titleCase(v.fleets ? v.fleets : null),
    estado: v.is_active ? "Activo" : "Inactivo",
    conductor: titleCase(conductor),
    conductorDni: v.driver?.dni ?? null,
  };
}

// GET /api/vehiculos
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      orderBy: { placa: "asc" },
    });
    res.json(vehiculos);
  } catch (err) {
    next(err);
  }
});

// GET /api/vehiculos/externos  -> proxy al API de Drivin
router.get("/externos", requireAuth, async (_req, res, next) => {
  try {
    if (!env.DRIVIN_API_KEY) {
      throw new HttpError(500, "Falta configurar DRIVIN_API_KEY en el backend");
    }

    const resp = await fetch(`${env.DRIVIN_API_URL}/v2/vehicles`, {
      headers: { "X-API-Key": env.DRIVIN_API_KEY },
    });

    if (!resp.ok) {
      throw new HttpError(
        502,
        `El API de Drivin respondió ${resp.status}`
      );
    }

    const data = (await resp.json()) as { response?: DrivinVehicle[] };
    const list = Array.isArray(data.response) ? data.response : [];
    // Adjunta los valores guardados localmente (override por placa).
    const locales = await prisma.vehiculo.findMany({
      where: {
        OR: [{ capacidadReal: { not: null } }, { cubicaje: { not: null } }],
      },
      select: { placa: true, capacidadReal: true, cubicaje: true },
    });
    const overridePorPlaca = new Map(
      locales.map((l) => [l.placa, { capacidadReal: l.capacidadReal, cubicaje: l.cubicaje }])
    );
    const mapped = list.map((v) => {
      const base = mapVehiculo(v);
      const ov = overridePorPlaca.get(base.placa);
      return {
        ...base,
        capacidadReal: ov?.capacidadReal ?? null,
        cubicaje: ov?.cubicaje ?? null,
      };
    });
    res.json(mapped.sort((a, b) => a.placa.localeCompare(b.placa)));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/vehiculos/capacidad-real  -> guarda capacidad real y cubicaje por placa
const capacidadRealSchema = z.object({
  placa: z
    .string()
    .trim()
    .min(1, "La placa es obligatoria")
    .transform((v) => v.toUpperCase()),
  capacidadReal: z
    .union([z.string().trim(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null || v === "") return null;
      return String(v);
    }),
  cubicaje: z
    .union([z.string().trim(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null || v === "") return null;
      return String(v);
    }),
});

router.patch("/capacidad-real", requireAuth, requirePermiso("/configuracion/vehiculos"), async (req, res, next) => {
  try {
    const parsed = capacidadRealSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }
    const { placa, capacidadReal, cubicaje } = parsed.data;
    const vehiculo = await prisma.vehiculo.upsert({
      where: { placa },
      update: { capacidadReal: capacidadReal ?? null, cubicaje: cubicaje ?? null },
      create: { placa, capacidadReal: capacidadReal ?? null, cubicaje: cubicaje ?? null },
    });
    res.json({
      placa: vehiculo.placa,
      capacidadReal: vehiculo.capacidadReal,
      cubicaje: vehiculo.cubicaje,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/vehiculos
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = vehiculoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const existing = await prisma.vehiculo.findUnique({
      where: { placa: parsed.data.placa },
    });
    if (existing) {
      throw new HttpError(409, "Ya existe un vehículo con esa placa");
    }

    const vehiculo = await prisma.vehiculo.create({ data: parsed.data });
    res.status(201).json(vehiculo);
  } catch (err) {
    next(err);
  }
});

export default router;
