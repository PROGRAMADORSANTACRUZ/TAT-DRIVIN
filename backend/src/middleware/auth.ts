import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { HttpError } from "./errorHandler";

export interface AuthPayload {
  sub: string;
  cedula: string;
  role: string;
  permisos?: string[] | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new HttpError(401, "No autorizado"));
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    next();
  } catch {
    next(new HttpError(401, "Token inválido o expirado"));
  }
}

// Exige que el usuario tenga permiso sobre un módulo. ADMIN/DEVELOPER y usuarios
// sin permisos configurados (null) tienen acceso total (retrocompatible).
export function requirePermiso(moduloKey: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(new HttpError(401, "No autorizado"));
    if (u.role === "ADMIN" || u.role === "DEVELOPER") return next();
    if (!u.permisos) return next(); // sin restricción configurada
    if (u.permisos.some((p) => moduloKey === p || moduloKey.startsWith(p + "/"))) return next();
    next(new HttpError(403, "No tienes permiso para este módulo"));
  };
}
