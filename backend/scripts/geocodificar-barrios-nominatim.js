// Geocodificación (gratis, sin registro) de barrio para clientes TAT que no
// tienen dato de barrio en el archivo origen. Usa Nominatim (OpenStreetMap),
// respetando su política de uso: 1 solicitud/segundo, User-Agent identificable.
// Escribe en BD inmediatamente cada acierto (progreso persistente ante cortes).
// Resultado de la corrida (2026-09-14): 1697 pendientes -> 879 con barrio
// encontrado (871 en la corrida principal + 4 en el reintento de errores 503;
// 4 quedaron sin dato porque la respuesta solo trajo ciudad/país).
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MUNICIPIOS_POR_DEPARTAMENTO = require("./municipios-por-departamento.json");
function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
const CIUDAD_A_DEPTO = new Map();
for (const [depto, ciudades] of Object.entries(MUNICIPIOS_POR_DEPARTAMENTO)) {
  for (const c of ciudades) CIUDAD_A_DEPTO.set(norm(c), depto);
}

const UA = "DistrilogSantaCruz/1.0 (uso interno, backfill de barrios; contacto: sistemas@santacruz.local)";
const CAMPOS_BARRIO = ["suburb", "neighbourhood", "quarter", "city_district", "borough"];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function geocodificar(direccion, ciudad, intentos = 3) {
  const q = `${direccion}, ${ciudad}, Colombia`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=co&limit=1&q=${encodeURIComponent(q)}`;
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const addr = data[0].address || {};
      for (const campo of CAMPOS_BARRIO) if (addr[campo]) return { barrio: addr[campo], state: addr.state || null };
      return { barrio: null, state: addr.state || null };
    }
    if (i < intentos - 1) await sleep(3000);
  }
  throw new Error(`HTTP fallo tras ${intentos} intentos`);
}

(async () => {
  const pendientes = await prisma.cliente.findMany({
    where: { OR: [{ barrio: null }, { barrio: "" }] },
    select: { id: true, direccion: true, provincia: true, region: true },
  });
  console.log("Pendientes de geocodificar:", pendientes.length);

  let ok = 0, sinBarrioEnRespuesta = 0, sinResultado = 0, errores = 0, deptoCompletado = 0;
  const inicio = Date.now();

  for (let i = 0; i < pendientes.length; i++) {
    const c = pendientes[i];
    if (!c.direccion || !c.provincia) { sinResultado++; continue; }
    try {
      const r = await geocodificar(c.direccion, c.provincia);
      const data = {};
      if (r && r.barrio) { data.barrio = r.barrio; ok++; } else { sinBarrioEnRespuesta++; }
      if (!c.region && r && r.state) {
        const depto = CIUDAD_A_DEPTO.get(norm(c.provincia)) || null;
        data.region = depto || r.state;
        deptoCompletado++;
      }
      if (Object.keys(data).length > 0) {
        await prisma.cliente.update({ where: { id: c.id }, data });
      }
    } catch (e) {
      errores++;
      console.log("Error en", c.id, e.message);
    }
    if ((i + 1) % 50 === 0 || i === pendientes.length - 1) {
      const mins = ((Date.now() - inicio) / 60000).toFixed(1);
      console.log(`[${i + 1}/${pendientes.length}] ok=${ok} sinBarrio=${sinBarrioEnRespuesta} sinDireccion=${sinResultado} errores=${errores} (${mins} min)`);
    }
    await sleep(1100); // política Nominatim: máx. 1 solicitud/segundo
  }

  console.log("\n=== Resumen ===");
  console.log("Total pendientes:", pendientes.length);
  console.log("Barrio encontrado:", ok);
  console.log("Respuesta sin barrio (solo ciudad/país):", sinBarrioEnRespuesta);
  console.log("Sin dirección/ciudad para consultar:", sinResultado);
  console.log("Departamento completado desde geocodificación:", deptoCompletado);
  console.log("Errores:", errores);

  await prisma.$disconnect();
})();
