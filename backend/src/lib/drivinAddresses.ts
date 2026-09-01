// Cruce de clientes de las órdenes contra las direcciones registradas en Drivin.
// Drivin expone GET /v2/addresses con: code (nº de registro), name, client, address1.
// Algunas direcciones vienen concatenadas como "CLIENTE - DESTINO", por eso se
// normaliza quitando acentos/caracteres especiales y se generan varias claves.
import { env } from "../config/env";

export interface DrivinAddress {
  code: string | null;
  name: string | null;
  client: string | null;
  address1: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AddressIndex {
  keys: Map<string, DrivinAddress>;
  byCode: Map<string, DrivinAddress>;
  list: DrivinAddress[];
}

// Normaliza: sin acentos, mayúsculas, solo alfanumérico + espacios, espacios colapsados.
export function normStrip(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Quita el prefijo "MEGATIENDA(S)" para comparar solo el nombre de la sede.
function stripMega(s: string): string {
  return s.replace(/^MEGATIENDAS?\s+/, "").trim();
}

// Versión sin espacios para tolerar nombres pegados ("SANFERNANDO" ~ "SAN FERNANDO").
function nospace(s: string): string {
  return normStrip(s).replace(/\s+/g, "");
}

// Palabras que no identifican una sede (calles, genéricos).
const STOP_SEDE = new Set([
  "STO", "PDV", "LOCAL", "LOC", "PRINCIPAL", "CARRERA", "CALLE", "DIAGONAL",
  "TRANSVERSAL", "AVENIDA", "AV", "CRA", "CLL", "NUMERO", "MZ", "BODEGA",
]);

// Extrae el código inicial del destino ("102-BAZURTO" -> "102").
function codigoDeDestino(destino: string): string | null {
  const m = normStrip(destino).match(/^([0-9]+)\b/);
  return m ? m[1] : null;
}

export async function fetchDrivinAddresses(): Promise<DrivinAddress[]> {
  if (!env.DRIVIN_API_KEY) return [];
  const resp = await fetch(`${env.DRIVIN_API_URL}/v2/addresses`, {
    headers: { "X-API-Key": env.DRIVIN_API_KEY },
  });
  if (!resp.ok) return [];
  const data = (await resp.json().catch(() => null)) as
    | { response?: DrivinAddress[] }
    | DrivinAddress[]
    | null;
  const arr = Array.isArray((data as { response?: DrivinAddress[] })?.response)
    ? (data as { response: DrivinAddress[] }).response
    : Array.isArray(data)
    ? (data as DrivinAddress[])
    : [];
  return arr;
}

// Índice de claves normalizadas → dirección de Drivin, con varias combinaciones.
export function buildAddressIndex(addresses: DrivinAddress[]): AddressIndex {
  const keys = new Map<string, DrivinAddress>();
  const byCode = new Map<string, DrivinAddress>();
  const add = (raw: string, a: DrivinAddress) => {
    const k = normStrip(raw);
    if (k && !keys.has(k)) keys.set(k, a);
  };
  for (const a of addresses) {
    if (a.code) {
      const ck = normStrip(a.code);
      if (ck && !byCode.has(ck)) byCode.set(ck, a);
    }
    if (a.name) {
      add(a.name, a);
      add(stripMega(normStrip(a.name)), a);
      add(nospace(a.name), a);
      add(nospace(stripMega(normStrip(a.name))), a);
    }
    if (a.client) {
      add(a.client, a);
      add(stripMega(normStrip(a.client)), a);
      add(nospace(a.client), a);
      add(nospace(stripMega(normStrip(a.client))), a);
    }
    if (a.address1) add(a.address1, a);
    if (a.client && a.name) add(`${a.client} ${a.name}`, a);
  }
  return { keys, byCode, list: addresses };
}

// Busca la dirección de Drivin que corresponde a un (cliente, destino) de la orden.
export function matchDrivinAddress(
  index: AddressIndex,
  cliente: string,
  destino: string
): DrivinAddress | null {
  const C = normStrip(cliente);
  const D = normStrip(destino);

  // 1) Por código de registro incrustado en el destino ("102-BAZURTO" -> 102).
  const codigo = codigoDeDestino(destino);
  if (codigo && index.byCode.has(codigo)) return index.byCode.get(codigo)!;

  // 2) Claves exactas y variantes (nombre de sede sin el código inicial).
  const Dsede = D.replace(/^[0-9]+\s+/, "");
  const candidatos = [
    `${C} ${D}`,
    D,
    C,
    Dsede,
    `MEGATIENDA ${Dsede}`,
    stripMega(C),
    nospace(C),
    nospace(stripMega(C)),
    nospace(Dsede),
  ];
  for (const c of candidatos) {
    const hit = index.keys.get(normStrip(c));
    if (hit) return hit;
  }

  // 3) Puntaje por nombre de sede + marca del cliente (Olimpica, Carnes, etc.).
  const sedeWords = Dsede.split(" ").filter(
    (w) => w.length >= 4 && !STOP_SEDE.has(w) && !/^[0-9]+$/.test(w)
  );
  const clientTokens = C.split(" ").filter((w) => w.length >= 5);
  if (sedeWords.length > 0) {
    let best: DrivinAddress | null = null;
    let bestScore = 0;
    for (const a of index.list) {
      const nameCity = normStrip(`${a.name ?? ""} ${a.city ?? ""}`);
      let score = 0;
      for (const w of sedeWords) if (nameCity.includes(w)) score += 2;
      const clientNorm = normStrip(a.client ?? "");
      for (const t of clientTokens)
        if (clientNorm.includes(t)) {
          score += 1;
          break;
        }
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (best && bestScore >= 2) return best;
  }

  // 4) Coincidencia por prefijo para nombres largos (truncados/plurales).
  const objetivo = stripMega(C).length >= 6 ? stripMega(C) : "";
  const objetivoSede = Dsede.length >= 5 ? Dsede : "";
  for (const a of index.list) {
    const campos = [a.name, a.client, a.address1]
      .filter(Boolean)
      .map((x) => stripMega(normStrip(x)));
    for (const campo of campos) {
      if (
        (objetivo && (campo.startsWith(objetivo) || objetivo.startsWith(campo))) ||
        (objetivoSede && (campo === objetivoSede || campo.endsWith(objetivoSede)))
      ) {
        return a;
      }
    }
  }

  return null;
}
