// Reintento robusto de lat/lon/codigo postal para los clientes TAT que quedaron
// sin resolver en la corrida anterior (2188 de 4156: 1633 por fallos de red
// "fetch failed" que NO se reintentaban dentro del propio geocodificar(), y
// 555 sin resultado de Nominatim). Ahora sí reintenta tambien los fallos de
// red (antes solo reintentaba códigos HTTP no-OK) y usa un "circuit breaker":
// si hay muchos fallos seguidos, pausa varios minutos antes de seguir (evita
// insistir contra un bloqueo temporal de Nominatim por exceso de volumen).
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

async function geocodificar(direccion, ciudad, intentos = 4) {
  const q = `${direccion}, ${ciudad}, Colombia`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=co&limit=1&q=${encodeURIComponent(q)}`;
  let lastErr = null;
  for (let i = 0; i < intentos; i++) {
    try {
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
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < intentos - 1) await sleep(4000 * (i + 1));
  }
  throw lastErr;
}

(async () => {
  const pendientes = await prisma.cliente.findMany({
    where: { tipo: "TAT", OR: [{ lat: null }, { lat: "" }] },
    select: { id: true, direccion: true, provincia: true, region: true, barrio: true },
  });
  console.log("Pendientes de reintentar:", pendientes.length);

  let okLatLon = 0, okCp = 0, okBarrio = 0, okRegion = 0, sinResultado = 0, sinDireccion = 0, errores = 0;
  let consecutivosFallidos = 0;
  const inicio = Date.now();

  for (let i = 0; i < pendientes.length; i++) {
    const c = pendientes[i];
    if (!c.direccion || !c.provincia) { sinDireccion++; continue; }
    try {
      const r = await geocodificar(c.direccion, c.provincia);
      consecutivosFallidos = 0;
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
      consecutivosFallidos++;
      console.log("Error en", c.id, e.message);
      if (consecutivosFallidos >= 15) {
        console.log(">> 15 fallos seguidos, pausando 3 minutos (posible bloqueo temporal de Nominatim)...");
        await sleep(3 * 60 * 1000);
        consecutivosFallidos = 0;
      }
    }
    if ((i + 1) % 50 === 0 || i === pendientes.length - 1) {
      const mins = ((Date.now() - inicio) / 60000).toFixed(1);
      console.log(`[${i + 1}/${pendientes.length}] latLon=${okLatLon} codigoPostal=${okCp} barrio=${okBarrio} region=${okRegion} sinResultado=${sinResultado} errores=${errores} (${mins} min)`);
    }
    await sleep(1600); // un poco mas espaciado que la corrida anterior
  }

  console.log("\n=== Resumen reintento ===");
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
