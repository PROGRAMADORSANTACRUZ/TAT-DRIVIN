import { prisma } from "./prisma";

// Crea novedades "Sin Novedad" (sin DL) en el Nivel de Servicio para las remisiones
// indicadas que tengan vehículo asignado y aún no estén en el Nivel. No duplica.
// Devuelve cuántas novedades nuevas se crearon.
export async function enviarOrdenesANivel(numeros: string[]): Promise<number> {
  const unicos = [...new Set(numeros.filter(Boolean))];
  if (unicos.length === 0) return 0;

  const ordenes = await prisma.orden.findMany({
    where: { numeroOrden: { in: unicos }, asignadoVehiculo: { not: null } },
  });
  const porOrden = new Map<string, (typeof ordenes)[number]>();
  for (const o of ordenes) if (!porOrden.has(o.numeroOrden)) porOrden.set(o.numeroOrden, o);

  const yaExisten = await prisma.novedad.findMany({
    where: { numeroOrden: { in: unicos } },
    select: { numeroOrden: true },
  });
  const existentes = new Set(yaExisten.map((n) => n.numeroOrden));

  const aCrear = [...porOrden.values()].filter((o) => !existentes.has(o.numeroOrden));
  if (aCrear.length === 0) return 0;

  let creadas = 0;
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
  return creadas;
}
