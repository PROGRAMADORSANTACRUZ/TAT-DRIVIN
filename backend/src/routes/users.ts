import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

const userSchema = z.object({
  cedula: z.string().trim().regex(/^\d{6,15}$/, "La cédula debe tener entre 6 y 15 dígitos"),
  name: z.string().trim().min(1, "Nombre requerido"),
  role: z.enum(["USER", "ADMIN", "DEVELOPER"]).default("USER"),
  password: z.string().min(4, "Contraseña mínimo 4 caracteres").optional(),
  permisos: z.array(z.string()).optional().nullable(),
});

const SELECT = {
  id: true,
  cedula: true,
  name: true,
  role: true,
  permisos: true,
  createdAt: true,
  updatedAt: true,
};

// Convierte el permisos (JSON string) a array para la respuesta.
function mapUser<T extends { permisos: string | null }>(u: T) {
  return { ...u, permisos: u.permisos ? (JSON.parse(u.permisos) as string[]) : null };
}

// GET /api/users
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: SELECT,
      orderBy: [{ name: "asc" }],
    });
    res.json(users.map(mapUser));
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { cedula, name, role, password } = parsed.data;
    if (!password) throw new HttpError(400, "Contraseña requerida al crear usuario");

    const exists = await prisma.user.findUnique({ where: { cedula } });
    if (exists) throw new HttpError(409, "Ya existe un usuario con esa cédula");

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        cedula,
        name,
        role,
        password: hash,
        permisos: parsed.data.permisos ? JSON.stringify(parsed.data.permisos) : null,
      },
      select: SELECT,
    });
    res.status(201).json(mapUser(user));
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN" && req.user?.role !== "DEVELOPER") {
      throw new HttpError(403, "Requiere rol ADMIN");
    }
    const id = String(req.params.id);
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { cedula, name, role, password } = parsed.data;

    const dup = await prisma.user.findFirst({ where: { cedula, NOT: { id } } });
    if (dup) throw new HttpError(409, "Ya existe otro usuario con esa cédula");

    const data: Record<string, unknown> = { cedula, name, role };
    if (password) data.password = await bcrypt.hash(password, 10);
    if (parsed.data.permisos !== undefined) {
      data.permisos = parsed.data.permisos ? JSON.stringify(parsed.data.permisos) : null;
    }

    const user = await prisma.user.update({ where: { id }, data, select: SELECT });
    res.json(mapUser(user));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN" && req.user?.role !== "DEVELOPER") {
      throw new HttpError(403, "Requiere rol ADMIN");
    }
    if (req.user?.sub === String(req.params.id)) {
      throw new HttpError(400, "No puedes eliminarte a ti mismo");
    }
    await prisma.user.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
