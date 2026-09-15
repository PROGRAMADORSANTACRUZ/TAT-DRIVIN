// Alternativa a Nominatim (que nos empezó a responder HTTP 429 tras la corrida
// larga anterior): usa Photon (komoot.io), tambien gratis y sin registro.
// Valida que el resultado sea de la MISMA ciudad esperada (city/county/state)
// antes de aceptarlo, para no contaminar datos con matches de otra ciudad
// (Photon, a diferencia de Nominatim, a veces devuelve resultados de otra
// parte del pais si la direccion es ambigua).
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function geocodificar(direccion, ciudad, intentos = 4) {
  const dirLimpia = direccion.replace(/#/g, "No");
  const q = `${dirLimpia}, ${ciudad}, Colombia`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3`;
  const ciudadNorm = norm(ciudad);
  let lastErr = null;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        const feats = Array.isArray(data.features) ? data.features : [];
        for (const f of feats) {
          const p = f.properties || {};
          const candidatos = [p.city, p.county, p.district].filter(Boolean).map(norm);
          const coincide = candidatos.some((c) => c.includes(ciudadNorm) || ciudadNorm.includes(c));
          if (!coincide) continue;
          const [lon, lat] = f.geometry?.coordinates || [];
          return {
            lat: lat != null ? String(lat) : null,
            lon: lon != null ? String(lon) : null,
            codigoPostal: p.postcode || null,
            barrio: p.district || p.locality || p.suburb || null,
            state: p.state || null,
          };
        }
        return null; // hubo resultados pero ninguno de la ciudad esperada
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < intentos - 1) await sleep(3000 * (i + 1));
  }
  throw lastErr;
}

(async () => {
  const pendientes = await prisma.cliente.findMany({
    where: { tipo: "TAT", OR: [{ lat: null }, { lat: "" }] },
    select: { id: true, direccion: true, provincia: true, region: true, barrio: true },
  });
  console.log("Pendientes (Photon):", pendientes.length);

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
        console.log(">> 15 fallos seguidos, pausando 3 minutos...");
        await sleep(3 * 60 * 1000);
        consecutivosFallidos = 0;
      }
    }
    if ((i + 1) % 50 === 0 || i === pendientes.length - 1) {
      const mins = ((Date.now() - inicio) / 60000).toFixed(1);
      console.log(`[${i + 1}/${pendientes.length}] latLon=${okLatLon} codigoPostal=${okCp} barrio=${okBarrio} region=${okRegion} sinResultado=${sinResultado} errores=${errores} (${mins} min)`);
    }
    await sleep(1000);
  }

  console.log("\n=== Resumen Photon ===");
  console.log("Total pendientes:", pendientes.length);
  console.log("Lat/Lon completado:", okLatLon);
  console.log("Código Postal completado:", okCp);
  console.log("Barrio completado (extra):", okBarrio);
  console.log("Región completada (extra):", okRegion);
  console.log("Sin resultado de la ciudad esperada:", sinResultado);
  console.log("Sin dirección/ciudad para consultar:", sinDireccion);
  console.log("Errores:", errores);

  await prisma.$disconnect();
})();
