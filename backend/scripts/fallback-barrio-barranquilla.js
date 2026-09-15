// Fallback final: a los clientes TAT que, despues de Nominatim + Photon,
// siguen sin barrio, se les pone "Barranquilla" (pedido explicito del
// usuario) para que el campo no quede vacio. Se sincroniza tambien "comuna"
// (mismo valor, formato nativo Drivin) para mantener consistencia.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const pendientes = await prisma.cliente.findMany({
    where: { tipo: "TAT", OR: [{ barrio: null }, { barrio: "" }] },
    select: { id: true },
  });
  console.log("Clientes TAT sin barrio (fallback a Barranquilla):", pendientes.length);
  for (const c of pendientes) {
    await prisma.cliente.update({ where: { id: c.id }, data: { barrio: "Barranquilla", comuna: "Barranquilla" } });
  }
  console.log("Listo.");
  await prisma.$disconnect();
})();
