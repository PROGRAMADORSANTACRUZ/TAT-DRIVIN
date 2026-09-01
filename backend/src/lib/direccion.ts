// Normalizador de direcciones colombianas al formato canónico:
//   <Vía> <NúmeroVía> # <Placa>-<Placa2>[, <Complemento>]
// Basado en reglas (no usa servicios externos), pensado para correr en lote.

export interface DireccionNormalizada {
  original: string;
  estandar: string;
  revisar: boolean;
  motivo: string;
}

// Cada vía canónica con sus abreviaturas/typos frecuentes.
const VIAS: { canonical: string; abbr: string[] }[] = [
  { canonical: "Transversal", abbr: ["transversal", "transv", "trans", "tsv", "tv"] },
  { canonical: "Diagonal", abbr: ["diagonal", "diag", "dgl", "dg"] },
  { canonical: "Avenida", abbr: ["avenida", "avda", "ave", "av"] },
  { canonical: "Circular", abbr: ["circular", "circ", "cir"] },
  { canonical: "Kilómetro", abbr: ["kilometro", "kilómetro", "km"] },
  { canonical: "Carrera", abbr: ["carrera", "carerra", "carrra", "carra", "cra", "kra", "kr", "cr", "k"] },
  { canonical: "Calle", abbr: ["calle", "clle", "cll", "cal", "cl", "c"] },
  { canonical: "Vía", abbr: ["via", "vía"] },
];

// Pares (abreviatura -> vía canónica) ordenados por longitud desc para
// que "carrera" gane a "cra" y este a "cr", etc.
const VIA_PAIRS = VIAS.flatMap((v) => v.abbr.map((a) => ({ a, canonical: v.canonical })))
  .sort((x, y) => y.a.length - x.a.length);

const ZONAS: Record<string, string> = {
  sur: "Sur",
  s: "Sur",
  norte: "Norte",
  n: "Norte",
  este: "Este",
  e: "Este",
  oeste: "Oeste",
  o: "Oeste",
};

// Palabras que inician el complemento (todo lo que va tras la coma final).
const COMPLEMENTO_KEYS = [
  "apartamento", "apto", "apt",
  "torre", "tr",
  "bloque", "bl",
  "interior", "int",
  "manzana", "mz",
  "casa",
  "local", "lc",
  "piso",
  "conjunto", "cj",
  "urbanizacion", "urbanización", "urb",
  "barrio", "brr",
  "etapa",
  "oficina", "of",
  "edificio", "edif", "ed",
];

const VALIDA = /^(Carrera|Calle|Transversal|Diagonal|Avenida|Circular|Vía|Kilómetro)\s+\d+[A-ZÑ]?(\sSur|\sNorte|\sEste|\sOeste)?\s#\s\d+[A-ZÑ]?-(\d+[A-ZÑ]?|Esquina)(,\s.+)?$/;

function tituloComplemento(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lw = w.toLowerCase();
      if (lw === "apartamento" || lw === "apto" || lw === "apt") return "Apto";
      if (/^\d/.test(w)) return w.toUpperCase();
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(" ");
}

export function normalizarDireccion(raw: unknown): DireccionNormalizada {
  const original = String(raw ?? "").trim();
  const fail = (motivo: string): DireccionNormalizada => ({
    original,
    estandar: "",
    revisar: true,
    motivo,
  });

  if (!original) return fail("dirección vacía");

  // Base en minúsculas, sin puntos, con espacios colapsados.
  let s = original
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/,/g, " , ")
    .replace(/\s+/g, " ")
    .trim();

  // Separa complemento: parte desde la primera palabra clave de complemento.
  let complemento = "";
  const tokens = s.split(" ");
  let compIdx = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (COMPLEMENTO_KEYS.includes(tokens[i])) {
      compIdx = i;
      break;
    }
  }
  if (compIdx >= 0) {
    complemento = tituloComplemento(tokens.slice(compIdx).join(" ").replace(/,/g, " ").trim());
    s = tokens.slice(0, compIdx).join(" ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  } else {
    s = s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  }

  // 1) Vía.
  let via = "";
  let rest = "";
  for (const { a, canonical } of VIA_PAIRS) {
    const re = new RegExp(`^${a}(?![a-zñ])\\s*(.*)$`, "i");
    const m = s.match(re);
    if (m) {
      via = canonical;
      rest = m[1].trim();
      break;
    }
  }
  if (!via) return fail("no se reconoce la vía");

  // Normaliza separadores textuales a "#".
  rest = rest
    .replace(/n[°ºo](?=\s|\d)/gi, "#")
    .replace(/\bnro\b/gi, "#")
    .replace(/\bnumero\b/gi, "#")
    .replace(/\bnúmero\b/gi, "#")
    .replace(/\bno\b/gi, "#")
    .replace(/\bn\b/gi, "#")
    .replace(/\s+/g, " ")
    .trim();

  // 2) Número de vía (dígitos + letra pegada opcional).
  const mNum = rest.match(/^(\d+)\s*([a-zñ](?![a-zñ]))?/i);
  if (!mNum) return fail("sin número de vía");
  let numeroVia = mNum[1] + (mNum[2] ? mNum[2].toUpperCase() : "");
  rest = rest.slice(mNum[0].length).trim();

  // 3) Zona opcional (Sur/Norte/Este/Oeste).
  const mZona = rest.match(/^(sur|norte|este|oeste)\b/i);
  if (mZona) {
    numeroVia += " " + ZONAS[mZona[1].toLowerCase()];
    rest = rest.slice(mZona[0].length).trim();
  }

  // 4) Separador -> quita "#", "-" iniciales.
  rest = rest.replace(/^[#\-\s]+/, "").trim();

  // 5) Placa y placa2.
  const mPlaca = rest.match(/^(\d+)\s*([a-zñ](?![a-zñ]))?\s*[-#]?\s*(esquina|\d+\s*[a-zñ](?![a-zñ])|\d+)?/i);
  if (!mPlaca) return fail("sin número de placa");
  const placa = mPlaca[1] + (mPlaca[2] ? mPlaca[2].toUpperCase() : "");
  let placa2 = "";
  if (mPlaca[3]) {
    const p2 = mPlaca[3].trim();
    placa2 = /esquina/i.test(p2) ? "Esquina" : p2.replace(/\s+/g, "").toUpperCase();
  }

  // 6) Arma el estándar.
  const placaFull = placa2 ? `${placa}-${placa2}` : placa;
  let estandar = `${via} ${numeroVia} # ${placaFull}`;
  if (complemento) estandar += `, ${complemento}`;
  estandar = estandar.replace(/\s+/g, " ").trim();

  if (!VALIDA.test(estandar)) {
    return { original, estandar: "", revisar: true, motivo: "no cumple el patrón canónico" };
  }

  return { original, estandar, revisar: false, motivo: "" };
}
