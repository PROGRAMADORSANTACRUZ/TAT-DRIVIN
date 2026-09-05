import cron from "node-cron";
import { prisma } from "../lib/prisma";

// Cada día a las 6:00 PM (hora Colombia) limpia las órdenes cargadas del día para
// que las facturas de un día no se arrastren a las rutas del día siguiente.
// Los históricos (PlanillaDespacho) guardan su propia copia de los ítems, así que
// borrar las órdenes NO afecta históricos ni el Nivel de Servicio. Las facturas se
// pueden volver a cargar/escanear con normalidad al día siguiente.
export function iniciarLimpiezaDiaria(): void {
  cron.schedule(
    "0 18 * * *",
    async () => {
      try {
        const { count } = await prisma.orden.deleteMany({});
        console.log(`[limpieza 18:00] ${count} órdenes eliminadas (reset diario).`);
      } catch (e) {
        console.error("[limpieza 18:00] error:", (e as Error).message);
      }
    },
    { timezone: "America/Bogota" }
  );
  console.log("⏰ Job de limpieza diaria de órdenes programado (18:00 America/Bogota).");
}
