export function tc(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim();
}

// Estilo unificado de botones: blanco con borde (como el botón "Actualizar").
// btn: tamaño normal. btnSm: acciones compactas (tablas). btnFull: sin icono.
export const btn =
  "inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-60";

export const btnSm =
  "inline-flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] bg-white px-3 py-1.5 text-xs font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-60";

// Valida que un texto tenga forma de dirección colombiana:
// un tipo de vía (calle, carrera, transversal…), numeración con "#" (o "No")
// y un guion separando la placa (ej. "Calle 45 # 23 - 15").
const VIA_RE =
  /\b(calle|cll?|carrera|cra?|kra?|kr|avenida|av|ave|transversal|tv|trans|diagonal|dg|diag|circular|circ|autopista|anillo|via|v[ií]a|manzana|mz|kil[oó]metro|km|paseo|peatonal)\b/i;

export function direccionValida(dir: string): boolean {
  const d = (dir ?? "").trim();
  if (d.length < 5) return false;
  const tieneVia = VIA_RE.test(d);
  const tieneNumeral = d.includes("#") || /\bn[o°º.]*\s*\d/i.test(d);
  const tieneGuion = /\d\s*-\s*\d/.test(d);
  return tieneVia && tieneNumeral && tieneGuion;
}
