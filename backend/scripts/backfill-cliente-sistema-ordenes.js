// Backfill: aplica la resolucion CORREGIDA (destino/consecutivo real por
// encima del "codigo" crudo del Excel, que en Agropecuaria no es un codigo de
// cliente) a las ordenes YA cargadas en produccion, para que muestren el
// cliente real sin necesidad de reimportar los excels. Solo toca
// cliente/codigo/direccion/clienteSistemaId; NO toca estado (no se pisa el
// estado real de entrega que ya viene sincronizado de Drivin).
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
function claveSinEspacios(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\./g, "").replace(/\s+/g, "").trim();
}
const UMBRAL_SIMILITUD_NOMBRE = 0.5;
function similitudNombre(a, b) {
  const ta = new Set(norm(a).split(" ").filter((t) => t.length >= 3));
  const tb = new Set(norm(b).split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

(async () => {
  const clientesGS = await prisma.cliente.findMany({
    select: { id: true, cliente: true, codigoDireccion: true, direccion: true, consecutivos: true, tipo: true },
  });
  const gsPorCodigo = new Map();
  const gsPorDestino = new Map();
  for (const c of clientesGS) {
    if (c.codigoDireccion) gsPorCodigo.set(norm(c.codigoDireccion), c);
    if (!c.consecutivos) continue;
    try {
      for (const con of JSON.parse(c.consecutivos)) {
        const k = claveSinEspacios(con);
        if (k && !gsPorDestino.has(k)) gsPorDestino.set(k, c);
      }
    } catch { /* ignore */ }
  }
  const clientesConNombre = clientesGS.filter((c) => c.cliente && c.cliente.trim());
  function mejorMatchPorNombre(destino, clienteExcel) {
    let mejor = null, mejorScore = 0;
    for (const c of clientesConNombre) {
      const score = Math.max(similitudNombre(destino, c.cliente), similitudNombre(clienteExcel, c.cliente));
      if (score > mejorScore) { mejorScore = score; mejor = c; }
    }
    return mejorScore >= UMBRAL_SIMILITUD_NOMBRE ? mejor : null;
  }

  // --- AGROPECUARIA: destino/consecutivo manda sobre el codigo crudo del excel.
  const agro = await prisma.orden.findMany({
    where: { distribucion: "AGROPECUARIA" },
    select: { id: true, cliente: true, destino: true, codigo: true, direccion: true, clienteSistemaId: true },
  });
  console.log("Ordenes AGROPECUARIA a revisar:", agro.length);
  let actualizadasAgro = 0, yaOkAgro = 0, sinMatchAgro = 0;
  const nuevosConsecutivosPorCliente = new Map();
  for (const o of agro) {
    if (o.clienteSistemaId) { yaOkAgro++; continue; }
    const match =
      gsPorDestino.get(claveSinEspacios(`${o.cliente} - ${o.destino}`)) ??
      gsPorDestino.get(claveSinEspacios(o.destino)) ??
      (o.codigo ? gsPorCodigo.get(norm(o.codigo)) : undefined);
    let elegido = match;
    if (!elegido) elegido = mejorMatchPorNombre(o.destino, o.cliente);
    if (!elegido) { sinMatchAgro++; continue; }
    const data = { clienteSistemaId: elegido.id };
    if (elegido.codigoDireccion) data.codigo = elegido.codigoDireccion;
    if (elegido.direccion) data.direccion = elegido.direccion;
    if (elegido.cliente) data.cliente = elegido.cliente;
    await prisma.orden.update({ where: { id: o.id }, data });
    actualizadasAgro++;
    if (!match) {
      // Fue por parecido de nombre: guarda el consecutivo para la proxima vez.
      const consecutivo = `${o.cliente} - ${o.destino}`;
      let set = nuevosConsecutivosPorCliente.get(elegido.id);
      if (!set) { set = new Set(); nuevosConsecutivosPorCliente.set(elegido.id, set); }
      set.add(consecutivo);
    }
  }
  for (const [clienteId, nuevos] of nuevosConsecutivosPorCliente) {
    const actual = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { consecutivos: true } });
    if (!actual) continue;
    let lista = [];
    try { lista = actual.consecutivos ? JSON.parse(actual.consecutivos) : []; } catch { lista = []; }
    for (const n of nuevos) if (!lista.some((x) => x.toUpperCase() === n.toUpperCase())) lista.push(n);
    await prisma.cliente.update({ where: { id: clienteId }, data: { consecutivos: JSON.stringify(lista) } });
  }
  console.log("AGROPECUARIA actualizadas:", actualizadasAgro, "| ya tenian clienteSistemaId:", yaOkAgro, "| sin match:", sinMatchAgro);

  // --- TAT: el codigo YA es NIT-sucursal (formato valido de Cliente.codigoDireccion).
  const tat = await prisma.orden.findMany({
    where: { distribucion: "TAT" },
    select: { id: true, cliente: true, codigo: true, nit: true, clienteSistemaId: true },
  });
  console.log("\nOrdenes TAT a revisar:", tat.length);
  let actualizadasTat = 0, yaOkTat = 0, sinMatchTat = 0;
  for (const o of tat) {
    if (o.clienteSistemaId) { yaOkTat++; continue; }
    const clave = o.codigo || o.nit;
    const elegido = clave ? gsPorCodigo.get(norm(clave)) : undefined;
    if (!elegido) { sinMatchTat++; continue; }
    const data = { clienteSistemaId: elegido.id };
    if (elegido.cliente) data.cliente = elegido.cliente;
    await prisma.orden.update({ where: { id: o.id }, data });
    actualizadasTat++;
  }
  console.log("TAT actualizadas:", actualizadasTat, "| ya tenian clienteSistemaId:", yaOkTat, "| sin match:", sinMatchTat);

  await prisma.$disconnect();
})();
