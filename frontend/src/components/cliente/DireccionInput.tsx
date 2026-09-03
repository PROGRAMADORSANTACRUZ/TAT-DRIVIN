"use client";

import { useEffect, useRef, useState } from "react";

// Formato de nomenclatura urbana colombiana:
//   <TipoVía> <Vía> # <Cruce>-<Placa>   ej. "Carrera 58 # 91-30"

export const TIPOS_VIA = [
  "Avenida Calle",
  "Avenida Carrera",
  "Calle",
  "Carrera",
  "Transversal",
  "Diagonal",
  "Circular",
  "Avenida",
  "Autopista",
  "Vía",
  "Manzana",
  "Lote",
] as const;

interface Partes {
  tipoVia: string;
  via: string;
  cruce: string;
  placa: string;
}

const VACIO: Partes = { tipoVia: "", via: "", cruce: "", placa: "" };

const INPUT_CLS =
  "w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e]";

function limpiarSegmento(v: string): string {
  const m = v.toUpperCase().replace(/[^0-9A-Z]/g, "").match(/^(\d{1,3})([A-Z]?)(\d{0,2})/);
  return m ? m[1] + m[2] + m[3] : "";
}

function limpiarPlaca(v: string): string {
  const m = v.toUpperCase().replace(/[^0-9A-Z]/g, "").match(/^(\d{1,4})([A-Z]?)/);
  return m ? m[1] + m[2] : "";
}

function componer(p: Partes): string {
  if (!p.tipoVia || !p.via || !p.cruce || !p.placa) return "";
  return `${p.tipoVia} ${p.via} # ${p.cruce}-${p.placa}`;
}

function parsear(valor: string): Partes | null {
  if (!valor.trim()) return VACIO;
  const tipos = [...TIPOS_VIA].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(
    `^(${tipos})\\s+(\\d{1,3}[A-Z]?\\d{0,2})\\s*#\\s*(\\d{1,3}[A-Z]?\\d{0,2})\\s*-\\s*(\\d{1,4}[A-Z]?)$`,
    "i"
  );
  const m = valor.trim().match(re);
  if (!m) return null;
  const tipoVia = TIPOS_VIA.find((t) => t.toLowerCase() === m[1].toLowerCase()) ?? m[1];
  return { tipoVia, via: m[2].toUpperCase(), cruce: m[3].toUpperCase(), placa: m[4] };
}

export default function DireccionInput({
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

  function cambiarParte(campo: keyof Partes, raw: string) {
    const limpio =
      campo === "placa" ? limpiarPlaca(raw) : campo === "tipoVia" ? raw : limpiarSegmento(raw);
    const next = { ...partes, [campo]: limpio };
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
          placeholder="Dirección (formato libre)"
          className={INPUT_CLS}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-[#a86a12]">
            Formato libre: el software de producción podría rechazarlo.
          </span>
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[7.5rem] flex-1">
          <span className="mb-1 block text-[0.7rem] font-medium text-[#7a8794]">Tipo de vía</span>
          <select
            value={partes.tipoVia}
            onChange={(e) => cambiarParte("tipoVia", e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">—</option>
            {TIPOS_VIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <span className="mb-1 block text-[0.7rem] font-medium text-[#7a8794]">Vía</span>
          <input
            value={partes.via}
            onChange={(e) => cambiarParte("via", e.target.value)}
            placeholder="58"
            className={INPUT_CLS}
          />
        </div>
        <span className="pb-2 text-lg font-semibold text-[#7a8794]">#</span>
        <div className="w-20">
          <span className="mb-1 block text-[0.7rem] font-medium text-[#7a8794]">Cruce</span>
          <input
            value={partes.cruce}
            onChange={(e) => cambiarParte("cruce", e.target.value)}
            placeholder="91"
            className={INPUT_CLS}
          />
        </div>
        <span className="pb-2 text-lg font-semibold text-[#7a8794]">–</span>
        <div className="w-20">
          <span className="mb-1 block text-[0.7rem] font-medium text-[#7a8794]">Placa</span>
          <input
            value={partes.placa}
            onChange={(e) => cambiarParte("placa", e.target.value)}
            placeholder="30"
            className={INPUT_CLS}
          />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-[#7a8794]">
          {compuesta ? (
            <>Se guardará como: <span className="font-medium text-[#14352a]">{compuesta}</span></>
          ) : (
            "Completa tipo de vía, vía, cruce y placa."
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
