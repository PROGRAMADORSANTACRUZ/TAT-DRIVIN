"use client";

import { useEffect, useRef, useState } from "react";
import { tc } from "@/lib/utils";

// Referencia compositiva:  [TipoConjunto Nombre] - Apto <n> - B<bloque> - T<torre> - P<piso>
//   ej. "Edificio Areia - Apto 5B - B6 - T9 - P3"

const TIPOS_CONJUNTO = ["Conjunto", "Edificio", "Urbanización", "Condominio"] as const;

interface Partes {
  tipoConjunto: string;
  nombre: string;
  unidad: string;
  piso: string;
  bloque: string;
  torre: string;
}

const VACIO: Partes = { tipoConjunto: "", nombre: "", unidad: "", piso: "", bloque: "", torre: "" };

const INPUT_CLS =
  "w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e]";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function componer(p: Partes): string {
  const segmentos: string[] = [];
  const conjunto = norm(`${p.tipoConjunto} ${p.nombre}`);
  if (conjunto) segmentos.push(conjunto);
  const unidad = norm(p.unidad);
  if (unidad) segmentos.push(`Apto ${unidad}`);
  if (p.bloque.trim()) segmentos.push(`B${p.bloque.trim()}`);
  if (p.torre.trim()) segmentos.push(`T${p.torre.trim()}`);
  if (p.piso.trim()) segmentos.push(`P${p.piso.trim()}`);
  return segmentos.join(" - ");
}

function parsear(valor: string): Partes | null {
  if (!valor.trim()) return VACIO;
  const partes = valor.split(" - ").map((s) => s.trim()).filter(Boolean);
  const r: Partes = { ...VACIO };
  for (const p of partes) {
    let m: RegExpMatchArray | null;
    if (!r.torre && (m = p.match(/^T(\d+[A-Za-z]?|[A-Za-z])$/))) { r.torre = m[1]; continue; }
    if (!r.bloque && (m = p.match(/^B(\d+[A-Za-z]?|[A-Za-z]\d*)$/))) { r.bloque = m[1]; continue; }
    if (!r.piso && (m = p.match(/^P(\d+[A-Za-z]?)$/))) { r.piso = m[1].trim(); continue; }
    if (!r.unidad && (m = p.match(/^Apto\s+(.+)$/i))) { r.unidad = m[1].trim(); continue; }
    if (!r.nombre && (m = p.match(/^(Conjunto|Edificio|Urbanizaci[oó]n|Condominio)\b\s*(.*)$/i))) {
      const mapa: Record<string, string> = {
        conjunto: "Conjunto", edificio: "Edificio",
        "urbanización": "Urbanización", urbanizacion: "Urbanización", condominio: "Condominio",
      };
      r.tipoConjunto = mapa[m[1].toLowerCase()] ?? m[1];
      r.nombre = m[2].trim();
      continue;
    }
    if (!r.nombre) { r.nombre = p; continue; }
    return null;
  }
  if (norm(componer(r)) !== norm(valor)) return null;
  return r;
}

export default function ReferenciaInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (valor: string) => void;
}) {
  const [partes, setPartes] = useState<Partes>(() => parsear(value) ?? VACIO);
  const [modoLibre, setModoLibre] = useState(() => value.trim() !== "" && parsear(value) === null);
  const [textoLibre, setTextoLibre] = useState(value);
  const emitidoRef = useRef(value);

  useEffect(() => {
    if (value === emitidoRef.current) return;
    emitidoRef.current = value;
    const p = parsear(value);
    if (p === null) {
      setModoLibre(true);
      setTextoLibre(value);
    } else {
      setModoLibre(false);
      setPartes(p);
    }
  }, [value]);

  function emitir(nuevo: string) {
    emitidoRef.current = nuevo;
    onChange(nuevo);
  }

  function cambiarParte(campo: keyof Partes, valor: string) {
    const next = { ...partes, [campo]: valor };
    setPartes(next);
    emitir(componer(next));
  }

  function cambiarLibre(v: string) {
    setTextoLibre(v);
    emitir(v);
  }

  function activarModoLibre() {
    setTextoLibre(componer(partes) || textoLibre);
    setModoLibre(true);
  }

  function activarModoEstructurado() {
    const p = parsear(textoLibre);
    if (p) setPartes(p);
    setModoLibre(false);
    emitir(p ? componer(p) : "");
  }

  if (modoLibre) {
    return (
      <div>
        <input
          value={textoLibre}
          onChange={(e) => cambiarLibre(e.target.value)}
          placeholder="Referencia (formato libre)"
          className={INPUT_CLS}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-[#a86a12]">Formato libre (referencia no estándar).</span>
          <button
            type="button"
            onClick={activarModoEstructurado}
            className="shrink-0 text-xs font-medium text-[#2f8f4e] hover:underline"
          >
            Usar formato guiado
          </button>
        </div>
      </div>
    );
  }

  const compuesta = componer(partes);

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={partes.tipoConjunto}
          onChange={(e) => cambiarParte("tipoConjunto", e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Sin conjunto/edificio</option>
          {TIPOS_CONJUNTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={partes.nombre}
          readOnly={!partes.tipoConjunto}
          onChange={(e) => cambiarParte("nombre", tc(e.target.value))}
          placeholder={partes.tipoConjunto ? "Nombre" : "Elige el tipo primero"}
          className={`${INPUT_CLS} ${!partes.tipoConjunto ? "bg-[#f7faf5] text-[#7a8794]" : ""}`}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium text-[#7a8794]">Apartamento</span>
          <input
            value={partes.unidad}
            onChange={(e) => cambiarParte("unidad", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
            placeholder="5B"
            className={INPUT_CLS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium text-[#7a8794]">Bloque</span>
          <input
            value={partes.bloque}
            onChange={(e) => cambiarParte("bloque", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
            placeholder="6"
            className={INPUT_CLS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium text-[#7a8794]">Torre</span>
          <input
            value={partes.torre}
            onChange={(e) => cambiarParte("torre", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
            placeholder="9"
            className={INPUT_CLS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium text-[#7a8794]">Piso</span>
          <input
            value={partes.piso}
            onChange={(e) => cambiarParte("piso", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
            placeholder="3"
            className={INPUT_CLS}
          />
        </label>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-[#7a8794]">
          {compuesta ? (
            <>Se guardará como: <span className="font-medium text-[#14352a]">{compuesta}</span></>
          ) : (
            "Opcional."
          )}
        </span>
        <button
          type="button"
          onClick={activarModoLibre}
          className="shrink-0 text-xs font-medium text-[#2f8f4e] hover:underline"
        >
          Formato libre
        </button>
      </div>
    </div>
  );
}
