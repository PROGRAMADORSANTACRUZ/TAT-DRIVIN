// Completa lat/lon y código postal para clientes TAT (no los trae el archivo
// origen) usando Nominatim (gratis, sin registro). De paso, si "barrio" o
// "region" seguían vacíos, los completa también (misma consulta, sin costo
// extra). No pisa datos ya existentes, solo llena los campos vacíos.
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

const UA = "DistrilogSantaCruz/1.0 (uso interno, backfill de geo/codigo postal; contacto: sistemas@santacruz.local)";
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
      const top = data[0];
      const addr = top.address || {};
      let barrio = null;
      for (const campo of CAMPOS_BARRIO) if (addr[campo]) { barrio = addr[campo]; break; }
      return {
        lat: top.lat ? String(top.lat) : null,
        lon: top.lon ? String(top.lon) : null,
        codigoPostal: addr.postcode || null,
        barrio,
        state: addr.state || null,
      };
    }
    if (i < intentos - 1) await sleep(3000);
  }
  throw new Error(`HTTP fallo tras ${intentos} intentos`);
}

(async () => {
  const pendientes = await prisma.cliente.findMany({
    where: { tipo: "TAT", OR: [{ lat: null }, { lat: "" }] },
    select: { id: true, direccion: true, provincia: true, region: true, barrio: true },
  });
  console.log("Pendientes de geocodificar (lat/lon/codigo postal):", pendientes.length);

  let okLatLon = 0, okCp = 0, okBarrio = 0, okRegion = 0, sinResultado = 0, sinDireccion = 0, errores = 0;
  const inicio = Date.now();

  for (let i = 0; i < pendientes.length; i++) {
    const c = pendientes[i];
    if (!c.direccion || !c.provincia) { sinDireccion++; continue; }
    try {
      const r = await geocodificar(c.direccion, c.provincia);
      if (!r) { sinResultado++; continue; }
      const data = {};
      if (r.lat && r.lon) { data.lat = r.lat; data.lon = r.lon; okLatLon++; }
      if (r.codigoPostal) { data.codigoPostal = r.codigoPostal; okCp++; }
      if (!c.barrio && r.barrio) { data.barrio = r.barrio; okBarrio++; }
      if (!c.region && r.state) {
        data.region = CIUDAD_A_DEPTO.get(norm(c.provincia)) || r.state;
        okRegion++;
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
      console.log(`[${i + 1}/${pendientes.length}] latLon=${okLatLon} codigoPostal=${okCp} barrio=${okBarrio} region=${okRegion} sinResultado=${sinResultado} errores=${errores} (${mins} min)`);
    }
    await sleep(1100); // política Nominatim: máx. 1 solicitud/segundo
  }

  console.log("\n=== Resumen ===");
  console.log("Total pendientes:", pendientes.length);
  console.log("Lat/Lon completado:", okLatLon);
  console.log("Código Postal completado:", okCp);
  console.log("Barrio completado (extra):", okBarrio);
  console.log("Región completada (extra):", okRegion);
  console.log("Sin resultado de Nominatim:", sinResultado);
  console.log("Sin dirección/ciudad para consultar:", sinDireccion);
  console.log("Errores:", errores);

  await prisma.$disconnect();
})();
