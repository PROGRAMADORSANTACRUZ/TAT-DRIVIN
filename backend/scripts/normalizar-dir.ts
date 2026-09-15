/**
 * Normaliza direcciones de ClienteTat al formato "Via N # A - B".
 * Mejoras: vía en palabra completa (Cra/Kra -> Carrera, Cll/Clle -> Calle),
 * agrega el "#" faltante, mueve el texto tras la dirección a referencia y,
 * si la dirección está vacía pero la referencia trae la dirección, la recupera.
 *
 * Uso:
 *   npx tsx scripts/normalizar-dir.ts             (REPORTE)
 *   npx tsx scripts/normalizar-dir.ts --apply     (aplica; backup JSON antes)
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const up = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const VIAS: [string, string][] = [
  ["AVENIDA\\s+CARRERA|AV\\.?\\s*CRA|AV\\.?\\s*CR", "Avenida Carrera"],
  ["AVENIDA\\s+CALLE|AV\\.?\\s*CLL|AV\\.?\\s*CL", "Avenida Calle"],
  ["CARRERA|CRA|CRR|KRA|CR|KR", "Carrera"],
  ["CALLE|CLLE|CLL|CLE|CALL|CL", "Calle"],
  ["DIAGONAL|DIAGNAL|DIEAGONAL|DIAG|DGNL|DG", "Diagonal"],
  ["TRANSVERSAL|TRANSV|TRNSV|TRANV|TRANS|TRV|TVL|TV", "Transversal"],
  ["AVENIDA|AVDA|AVEN|AVE|AVN|AV", "Avenida"],
  ["AUTOPISTA|AUTOP|AUTP", "Autopista"],
  ["CIRCUNVALAR|CIRCUNV|CIRCUV|CIRC", "Circunvalar"],
  ["KILOMETRO|KMTRO|KM", "Kilómetro"],
  ["MANZANA|MZNA|MZA|MZ", "Manzana"],
  ["PASAJE|PSJE|PJE", "Pasaje"],
  ["PEATONAL|PEAT", "Peatonal"],
  ["VIA", "Vía"],
];
const VIA_ALT = VIAS.map(([a]) => a).join("|");
const NUM = "\\d{1,3}[A-Z]?";
const SUF = "(?:\\s?BIS)?(?:\\s?(?:SUR|NORTE|NTE|ESTE|OESTE))?";
// Abreviaturas de vía para separar cuando vienen pegadas a un número (Kr10 -> Kr 10).
const VIA_ABBR = "CARRERA|CRA|CRR|KRA|KR|CR|CALLE|CLLE|CLL|CLE|CALL|CL|DIAGONAL|DIAGNAL|DIAG|DGNL|DG|TRANSVERSAL|TRANSV|TRNSV|TRANS|TRV|TV|AVENIDA|AVDA|AVEN|AVE|AV|AUTOPISTA|CIRCUNVALAR|CIRC|KILOMETRO|KM|MANZANA|MZNA|MZA|MZ|PASAJE|PSJE|VIA";
const separarViaPegada = (u: string) => u.replace(new RegExp(`\\b(${VIA_ABBR})(\\d)`, "gi"), "$1 $2");

const UNIT = /^(APTO|APARTAMENTO|APT|APARTA|LOCAL|LOC|LC|CASA|TORRE|TO|PISO|INT|INTERIOR|BLOQUE|BLOQ|BL|MANZANA|MZ|MZA|KM|KILOMETRO|OF|OFICINA|OFC|ETAPA|ETAP|SECTOR|PARQUEADERO|LOTE|LT|BODEGA|BG|CONSULTORIO|ESCALERA|ENTRADA|PORTERIA|GARAJE)$/;
const DIRW = /^(SUR|NORTE|NTE|ESTE|OESTE|OCC|OCCIDENTE|ORIENTE|BIS|SR)$/;
const VIA_ONE = new RegExp(`^(?:${VIA_ALT})$`, "i");
const esPlacaTok = (tu: string) => /^#?[A-Z]?\d{1,3}[A-Z]?-\d{1,3}[A-Z]?$/.test(tu);
const trimPunct = (t: string) => t.replace(/^[^A-Za-z0-9#]+|[^A-Za-z0-9#]+$/g, "");
const titleCase = (s: string) => s.toLowerCase().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

function clean(s: string): string {
  let u = up(s);
  u = u.replace(/\bN(?:O|RO|UMERO)?\.?\s*[°º]?\b/g, "#");
  u = u.replace(/N[°º]/g, "#");
  u = separarViaPegada(u);
  u = u.replace(/#+/g, "#").replace(/\s+/g, " ").trim();
  return u;
}

// Busca la primera vía en cualquier parte del texto y parsea la dirección desde ahí.
function parseAddrDesde(texto: string): Parsed {
  const u = clean(texto);
  const m = u.match(new RegExp(`(?:${VIA_ALT})\\b`, "i"));
  if (!m || m.index === undefined) return null;
  return parseAddr(u.slice(m.index));
}

type Parsed = { via: string; n1: string; n2: string | null; n3: string | null; matchLen: number } | null;
function parseAddr(u: string): Parsed {
  const viaRe = new RegExp(`^(?:${VIA_ALT})\\b\\.?\\s*`, "i");
  const vm = u.match(viaRe);
  if (!vm) return null;
  const viaWord = vm[0].trim().replace(/\.$/, "");
  let canon = "Calle";
  for (const [alt, c] of VIAS) { if (new RegExp(`^(?:${alt})$`, "i").test(viaWord)) { canon = c; break; } }
  const rest = u.slice(vm[0].length);
  const m1 = rest.match(new RegExp(`^#?\\s*(${NUM}${SUF})`, "i"));
  if (!m1) return null;
  const n1 = m1[1].replace(/\s+/g, " ").trim();
  const after = rest.slice(m1[0].length);
  // Placa "N - N" o, si hay "#", también "N N" (espacio en vez de guion).
  const m2 = after.match(new RegExp(`^\\s*#\\s*(${NUM})\\s+(${NUM})(?!\\d)`, "i"))
    || after.match(new RegExp(`^\\s*#?\\s*(${NUM})\\s*-\\s*(${NUM})`, "i"));
  const n2 = m2 ? m2[1] : null;
  const n3 = m2 ? m2[2] : null;
  const usedLen = vm[0].length + m1[0].length + (m2 ? m2[0].length : 0);
  return { via: canon, n1, n2, n3, matchLen: usedLen };
}
function buscarPlaca(u: string): { n2: string; n3: string } | null {
  const m = u.match(new RegExp(`#?\\s*(${NUM})\\s*-\\s*(${NUM})`, "i"));
  return m ? { n2: m[1], n3: m[2] } : null;
}
function limpiarReferencia(refRaw: string): string | null {
  if (!refRaw) return null;
  // Separa placa pegada a palabra, vía pegada a número, y da espacio a "#" y guiones.
  let s = separarViaPegada(refRaw).replace(/(\d{1,3}[A-Za-z]?-\d{1,3})([A-Za-z]{2,})/g, "$1 $2");
  s = s.replace(/#/g, " # ").replace(/(\d[A-Za-z]?)\s*-\s*(\d)/g, "$1 - $2");
  const toks = s.split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  let prev = "";
  for (const t of toks) {
    const tu = up(trimPunct(t)).replace(/^#+/, "");
    if (!tu || tu === "#") continue;
    if (VIA_ONE.test(tu)) { prev = ""; continue; }
    if (esPlacaTok(tu)) { prev = ""; continue; }
    if (DIRW.test(tu)) { prev = ""; continue; }
    if (/^#?\d{1,3}[A-Z]{0,2}\d{0,2}$/.test(tu)) {
      // Número/remanente de dirección (2A1, 15A2, 9F1…): solo tras palabra-unidad.
      if (UNIT.test(up(prev))) { keep.push(trimPunct(t)); prev = t; } else { prev = ""; }
      continue;
    }
    if (/^[A-Z]$/.test(tu)) { prev = ""; continue; }
    keep.push(trimPunct(t)); prev = t;
  }
  const out = keep.join(" ").replace(/\s+/g, " ").replace(/^[\s,.\-]+|[\s,.\-]+$/g, "").trim();
  if (out.length < 2 || !/[A-Za-z]/.test(out)) return null;
  return out;
}
function fmt(via: string, n1: string, n2: string | null, n3: string | null): string {
  const base = `${via} ${n1}`.replace(/\s+/g, " ").trim();
  return n2 && n3 ? `${base} # ${n2} - ${n3}` : base;
}
function refTieneDireccion(ref0: string): boolean {
  const c = clean(ref0);
  return new RegExp(`(?:${VIA_ALT})\\b`, "i").test(c) || new RegExp(`#?\\s*${NUM}\\s*-\\s*${NUM}`, "i").test(c) || ref0.includes("#");
}

type Res = { dir: string | null; ref: string | null; changed: boolean; caso: string };
function normalizar(dirRaw: string | null, refRaw: string | null): Res {
  const dir0 = (dirRaw ?? "").trim();
  const ref0 = (refRaw ?? "").trim();

  // Dirección vacía: intenta recuperarla de la referencia (vía en cualquier parte).
  if (!dir0) {
    if (ref0 && refTieneDireccion(ref0)) {
      const p = parseAddrDesde(ref0);
      if (p) {
        let { n2, n3 } = p;
        if (!n2 || !n3) { const t = buscarPlaca(clean(ref0)); if (t) { n2 = t.n2; n3 = t.n3; } }
        const nd = fmt(p.via, p.n1, n2, n3);
        const nr = limpiarReferencia(ref0);
        return { dir: nd, ref: nr, changed: true, caso: "dir-de-referencia" };
      }
    }
    return { dir: dirRaw, ref: refRaw, changed: false, caso: "sin-dir" };
  }

  const du = clean(dir0);
  const parsed = parseAddr(du);
  if (!parsed) return { dir: dirRaw, ref: refRaw, changed: false, caso: "sin-via" };

  const { via, n1 } = parsed;
  let { n2, n3 } = parsed;
  const tail = du.slice(parsed.matchLen).trim();
  let caso = "reformato";
  if (!n2 || !n3) {
    const enTail = tail ? buscarPlaca(tail) : null;
    if (enTail) { n2 = enTail.n2; n3 = enTail.n3; }
    else if (ref0) { const enRef = buscarPlaca(clean(ref0)); if (enRef) { n2 = enRef.n2; n3 = enRef.n3; caso = "unida-de-referencia"; } }
  }

  const refBase = ref0 && refTieneDireccion(ref0) ? limpiarReferencia(ref0) : (ref0 || null);

  if (!n2 || !n3) {
    if (tail) {
      const changed = (refBase ?? "") !== ref0;
      return { dir: dirRaw, ref: refBase, changed, caso: "incompleta-tail" };
    }
    const nd = fmt(via, n1, null, null);
    const changed = nd !== dir0 || (refBase ?? "") !== ref0;
    return { dir: nd, ref: refBase, changed, caso: "incompleta" };
  }

  const tailClean = tail ? limpiarReferencia(tail) : null;
  const tailTC = tailClean ? titleCase(tailClean) : null;
  const nuevaRef = [tailTC, refBase].filter(Boolean).join(" - ") || null;
  const nuevaDir = fmt(via, n1, n2, n3);
  const changed = nuevaDir !== dir0 || (nuevaRef ?? "") !== ref0;
  return { dir: nuevaDir, ref: nuevaRef, changed, caso };
}

async function main() {
  console.log(APPLY ? "== APLICAR ==" : "== REPORTE ==");
  const db = await prisma.clienteTat.findMany({ where: { eliminado: false }, select: { id: true, direccion1: true, referencia: true } });
  console.log(`Clientes: ${db.length}`);
  const stats: Record<string, number> = {};
  const cambios: { id: string; dirA: string | null; dirB: string | null; refA: string | null; refB: string | null; caso: string }[] = [];
  for (const c of db) {
    const r = normalizar(c.direccion1, c.referencia);
    stats[r.caso] = (stats[r.caso] ?? 0) + 1;
    if (r.changed) cambios.push({ id: c.id, dirA: c.direccion1, dirB: r.dir, refA: c.referencia, refB: r.ref, caso: r.caso });
  }
  console.log("Casos:", stats);
  console.log(`Con cambios: ${cambios.length}`);
  const muestra = (caso: string, n: number) => {
    const list = cambios.filter((c) => c.caso === caso).slice(0, n);
    if (list.length === 0) return;
    console.log(`\n--- ${caso} ---`);
    for (const c of list) { console.log(`  DIR: "${c.dirA}" -> "${c.dirB}"`); if ((c.refA ?? "") !== (c.refB ?? "")) console.log(`  REF: "${c.refA}" -> "${c.refB}"`); }
  };
  muestra("dir-de-referencia", 20);
  muestra("reformato", 10);
  muestra("unida-de-referencia", 8);

  if (!APPLY) { console.log("\nREPORTE. Usa --apply para escribir."); await prisma.$disconnect(); return; }

  const backup = db.map((c) => ({ id: c.id, direccion1: c.direccion1, referencia: c.referencia }));
  const bpath = `scripts/backup-dir-${Date.now()}.json`;
  writeFileSync(bpath, JSON.stringify(backup));
  console.log(`Backup: ${bpath}`);
  let n = 0;
  for (const c of cambios) { await prisma.clienteTat.update({ where: { id: c.id }, data: { direccion1: c.dirB, referencia: c.refB } }); if (++n % 500 === 0) console.log(`  ${n}/${cambios.length}…`); }
  console.log(`Actualizados: ${n}\n✔ Listo.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
