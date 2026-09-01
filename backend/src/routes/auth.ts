import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, signToken } from "../middleware/auth";

const router = Router();

// La cédula: solo dígitos, entre 6 y 15 caracteres.
const cedulaSchema = z
  .string()
  .trim()
  .regex(/^\d{6,15}$/, "La cédula debe contener solo números (6 a 15 dígitos)");

const loginSchema = z.object({
  cedula: cedulaSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const registerSchema = z.object({
  cedula: cedulaSchema,
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  name: z.string().trim().min(1).optional(),
});

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const { cedula, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { cedula } });
    if (existing) {
      throw new HttpError(409, "Ya existe un usuario con esa cédula");
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { cedula, password: hashed, name: name ?? null },
    });

    const token = signToken({
      sub: user.id,
      cedula: user.cedula,
      role: user.role,
      permisos: null,
    });

    res.status(201).json({
      token,
      user: { id: user.id, cedula: user.cedula, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }

    const { cedula, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { cedula } });
    if (!user) {
      throw new HttpError(401, "Cédula o contraseña incorrectas");
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new HttpError(401, "Cédula o contraseña incorrectas");
    }

    const token = signToken({
      sub: user.id,
      cedula: user.cedula,
      role: user.role,
      permisos: user.permisos ? (JSON.parse(user.permisos) as string[]) : null,
    });

    res.json({
      token,
      user: {
        id: user.id,
        cedula: user.cedula,
        name: user.name,
        role: user.role,
        permisos: user.permisos ? (JSON.parse(user.permisos) as string[]) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, cedula: true, name: true, role: true, permisos: true, createdAt: true },
    });

    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    res.json({ user: { ...user, permisos: user.permisos ? (JSON.parse(user.permisos) as string[]) : null } });
  } catch (err) {
    next(err);
  }
});

export default router;
