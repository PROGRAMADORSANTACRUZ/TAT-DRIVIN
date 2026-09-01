import { Router } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth, requirePermiso } from "../middleware/auth";
import { env } from "../config/env";
import { normalizarDireccion } from "../lib/direccion";

const router = Router();

function limpiar(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

// Normaliza la dirección al formato canónico; si no se puede, deja la original.
function mapearDireccion(value: unknown): string | null {
  const original = limpiar(value);
  if (!original) return null;
  const { estandar, revisar } = normalizarDireccion(original);
  return revisar ? original : estandar;
}

interface ClienteTatApi {
  codigo_tercero?: string | null;
  nit?: string | null;
  razon_social?: string | null;
  sucursal?: string | null;
  descripcion_sucursal?: string | null;
  direccion1?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
  pais?: string | null;
  telefono?: string | null;
  celular?: string | null;
  correo?: string | null;
  id_vendedor?: string | null;
  vendedor?: string | null;
  id_criterio?: string | null;
  criterio?: string | null;
}

// GET /api/clientes-tat
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const clientes = await prisma.clienteTat.findMany({
      where: { eliminado: false },
      orderBy: { razonSocial: "asc" },
    });
    res.json(
      clientes.map((c) => ({
        ...c,
        consecutivos: c.consecutivos ? (JSON.parse(c.consecutivos) as string[]) : [],
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes-tat/:id/consecutivo  -> asigna un concatenado al cliente TAT
router.post("/:id/consecutivo", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const nuevo = String(req.body?.consecutivo ?? "").trim();
    if (!nuevo) throw new HttpError(400, "El concatenado es obligatorio");
    const current = await prisma.clienteTat.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Cliente no encontrado");
    const lista: string[] = current.consecutivos
      ? (JSON.parse(current.consecutivos) as string[])
      : [];
    if (!lista.some((x) => x.toUpperCase() === nuevo.toUpperCase())) lista.push(nuevo);
    const cliente = await prisma.clienteTat.update({
      where: { id },
      data: { consecutivos: JSON.stringify(lista) },
    });
    res.json({ ...cliente, consecutivos: lista });
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes-tat/sync  -> actualiza y agrega, respetando ediciones manuales
router.post("/sync", requireAuth, requirePermiso("/configuracion/clientes"), async (_req, res, next) => {
  try {
    // apiconsulta exige token en el query; sin él responde 401.
    const url = new URL(env.CLIENTES_TAT_URL);
    if (env.CLIENTES_TAT_TOKEN) url.searchParams.set("token", env.CLIENTES_TAT_TOKEN);
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new HttpError(502, `La API respondió ${resp.status}: ${body.slice(0, 150)}`);
    }

    const json = (await resp.json()) as { data?: ClienteTatApi[] };
    const filas = json.data ?? [];
    if (filas.length === 0) {
      throw new HttpError(502, "La API no devolvió clientes");
    }

    const data = filas.map((c) => ({
      codigoTercero: limpiar(c.codigo_tercero),
      nit: limpiar(c.nit),
      razonSocial: limpiar(c.razon_social),
      sucursal: limpiar(c.sucursal),
      descripcionSucursal: limpiar(c.descripcion_sucursal),
      direccion1: mapearDireccion(c.direccion1),
      barrio: limpiar(c.barrio),
      ciudad: limpiar(c.ciudad),
      departamento: limpiar(c.departamento),
      pais: limpiar(c.pais),
      telefono: limpiar(c.telefono),
      celular: limpiar(c.celular),
      correo: limpiar(c.correo),
      idVendedor: limpiar(c.id_vendedor),
      vendedor: limpiar(c.vendedor),
      idCriterio: limpiar(c.id_criterio),
      criterio: limpiar(c.criterio),
    }));

    // Índice de los existentes por su clave natural (código tercero o NIT).
    const existentes = await prisma.clienteTat.findMany({
      select: { codigoTercero: true, nit: true, editado: true, eliminado: true },
    });

    // Claves de clientes editados manualmente (se conservan tal cual).
    const editadoKeys = new Set<string>();
    // Claves de clientes eliminados (no deben reaparecer).
    const eliminadoKeys = new Set<string>();
    // Claves de los no editados vivos (para contar cuántos se actualizan).
    const noEditadoKeys = new Set<string>();
    let preservados = 0;
    for (const e of existentes) {
      if (e.eliminado) {
        if (e.codigoTercero) eliminadoKeys.add("c:" + e.codigoTercero);
        if (e.nit) eliminadoKeys.add("n:" + e.nit);
        continue;
      }
      if (e.editado) {
        preservados++;
        if (e.codigoTercero) editadoKeys.add("c:" + e.codigoTercero);
        if (e.nit) editadoKeys.add("n:" + e.nit);
      } else {
        if (e.codigoTercero) noEditadoKeys.add("c:" + e.codigoTercero);
        if (e.nit) noEditadoKeys.add("n:" + e.nit);
      }
    }

    const enSet = (row: (typeof data)[number], set: Set<string>) =>
      (row.codigoTercero && set.has("c:" + row.codigoTercero)) ||
      (row.nit && set.has("n:" + row.nit));

    // Excluye los editados (se conservan) y los eliminados (no reaparecen).
    const nuevos = data.filter(
      (row) => !enSet(row, editadoKeys) && !enSet(row, eliminadoKeys)
    );

    let actualizados = 0;
    for (const row of nuevos) {
      if (enSet(row, noEditadoKeys)) actualizados++;
    }
    const creados = nuevos.length - actualizados;

    await prisma.$transaction([
      prisma.clienteTat.deleteMany({
        where: { editado: false, eliminado: false },
      }),
      prisma.clienteTat.createMany({ data: nuevos }),
    ]);

    res.status(201).json({
      sincronizados: creados + actualizados,
      creados,
      actualizados,
      preservados,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/clientes-tat/:id  -> edita un cliente y lo marca como corregido
router.put("/:id", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existe = await prisma.clienteTat.findUnique({ where: { id } });
    if (!existe) throw new HttpError(404, "Cliente no encontrado");

    const b = req.body ?? {};
    const cliente = await prisma.clienteTat.update({
      where: { id },
      data: {
        codigoTercero: limpiar(b.codigoTercero),
        nit: limpiar(b.nit),
        razonSocial: limpiar(b.razonSocial),
        sucursal: limpiar(b.sucursal),
        descripcionSucursal: limpiar(b.descripcionSucursal),
        direccion1: limpiar(b.direccion1),
        barrio: limpiar(b.barrio),
        ciudad: limpiar(b.ciudad),
        departamento: limpiar(b.departamento),
        pais: limpiar(b.pais),
        telefono: limpiar(b.telefono),
        celular: limpiar(b.celular),
        correo: limpiar(b.correo),
        idVendedor: limpiar(b.idVendedor),
        vendedor: limpiar(b.vendedor),
        idCriterio: limpiar(b.idCriterio),
        criterio: limpiar(b.criterio),
        referencia: limpiar(b.referencia),
        lat: limpiar(b.lat),
        lon: limpiar(b.lon),
        puntoVenta: limpiar(b.puntoVenta),
        tipo: limpiar(b.tipo),
        ...(Array.isArray(b.consecutivos)
          ? {
              consecutivos: JSON.stringify(
                b.consecutivos.map((s: unknown) => String(s).trim()).filter(Boolean)
              ),
            }
          : {}),
        editado: true,
        editadoAt: new Date(),
      },
    });

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

// DELETE /api/clientes-tat/:id  -> borrado lógico (no reaparece al sincronizar)
router.delete("/:id", requireAuth, requirePermiso("/configuracion/clientes"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existe = await prisma.clienteTat.findUnique({ where: { id } });
    if (!existe) throw new HttpError(404, "Cliente no encontrado");

    await prisma.clienteTat.update({
      where: { id },
      data: { eliminado: true, eliminadoAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
