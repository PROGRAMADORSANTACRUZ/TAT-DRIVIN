// Corrige el efecto de un bug ya arreglado en el import: estadoDesdePod()
// mapeaba "pending"/"in-transit" (ya despachada en Drivin) a "Pendiente" en
// vez de "Enviado". Cada reimport diario devolvia estas ordenes a "Pendiente"
// aunque Drivin ya las tuviera en una ruta (scenarioToken presente),
// haciendolas parecer no asignadas/perdidas. Aplica una sola vez para
// corregir las ya afectadas; el import de ahora en adelante ya no lo repite.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const { count } = await prisma.orden.updateMany({
    where: { distribucion: "AGROPECUARIA", estado: "Pendiente", NOT: { scenarioToken: null } },
    data: { estado: "Enviado" },
  });
  console.log("Ordenes corregidas (Pendiente -> Enviado, ya tenian scenarioToken de Drivin):", count);
  await prisma.$disconnect();
})();
