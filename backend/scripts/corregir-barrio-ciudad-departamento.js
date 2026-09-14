// Corrige los campos "corridos" de Cliente:
//  - barrio (columna dedicada, vacía en casi todos) <- comuna (nivel barrio real,
//    confirmado porque "provincia" ya tiene la ciudad real de forma independiente).
//  - region (departamento) <- se recalcula/confirma cruzando "provincia" (ciudad)
//    contra la lista de municipios por departamento; si no hay match, se conserva
//    el valor previo de region.
// "comuna" y "provincia" NO se tocan (se preservan tal cual, formato nativo Drivin).
// Hace backup completo de Cliente antes de escribir.
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const prisma = new PrismaClient();

const MUNICIPIOS_POR_DEPARTAMENTO = require("./municipios-por-departamento.json");

function norm(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}
const CIUDAD_A_DEPTO = new Map();
for (const [depto, ciudades] of Object.entries(MUNICIPIOS_POR_DEPARTAMENTO)) {
  for (const c of ciudades) CIUDAD_A_DEPTO.set(norm(c), depto);
}
function departamentoDeCiudad(ciudad) {
  return CIUDAD_A_DEPTO.get(norm(ciudad)) ?? null;
}

(async () => {
  const clientes = await prisma.cliente.findMany();

  const backupPath = path.join(__dirname, `backup-antes-fix-barrio-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(clientes, null, 2));
  console.log("Backup escrito en:", backupPath, "(", clientes.length, "filas )");

  let barrioAsignado = 0, sinDatoBarrio = 0, deptoCorregido = 0, deptoSinMatch = 0;
  const updates = [];

  for (const c of clientes) {
    const comuna = (c.comuna || "").trim();
    const provincia = (c.provincia || "").trim();

    let nuevoBarrio = c.barrio;
    if (!nuevoBarrio && comuna) {
      nuevoBarrio = comuna;
      barrioAsignado++;
    } else if (!nuevoBarrio) {
      sinDatoBarrio++;
    }

    let nuevaRegion = c.region;
    const deptoPorLista = provincia ? departamentoDeCiudad(provincia) : null;
    if (deptoPorLista) {
      if (norm(c.region || "") !== norm(deptoPorLista)) deptoCorregido++;
      nuevaRegion = deptoPorLista;
    } else if (!nuevaRegion) {
      deptoSinMatch++;
    }

    if (nuevoBarrio !== c.barrio || nuevaRegion !== c.region) {
      updates.push({ id: c.id, barrio: nuevoBarrio || null, region: nuevaRegion || null });
    }
  }

  console.log("Total clientes:", clientes.length);
  console.log("Barrio asignado desde comuna:", barrioAsignado);
  console.log("Sin dato para barrio (queda pendiente de geocodificar):", sinDatoBarrio);
  console.log("Departamento corregido/confirmado por lista:", deptoCorregido);
  console.log("Departamento sin match en lista y sin valor previo:", deptoSinMatch);
  console.log("Registros a actualizar en BD:", updates.length);

  for (const u of updates) {
    await prisma.cliente.update({ where: { id: u.id }, data: { barrio: u.barrio, region: u.region } });
  }
  console.log("Actualización completa.");

  await prisma.$disconnect();
})();
