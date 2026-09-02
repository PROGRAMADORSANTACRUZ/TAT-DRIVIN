"use client";

import { useEffect, useRef, useState } from "react";
import { buscarMunicipios, type Municipio } from "@/data/colombia";

const INPUT_CLS =
  "w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e]";

// Buscador de ciudades de Colombia. Al elegir una, entrega ciudad + departamento.
export default function CiudadInput({
  value,
  onSelect,
  placeholder = "Buscar ciudad…",
}: {
  value: string;
  onSelect: (ciudad: string, departamento: string) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(value);
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Municipio[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setTexto(value), [value]);

  useEffect(() => {
    const onClickFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  function abrir(q: string) {
    setResultados(buscarMunicipios(q, 60));
    setAbierto(true);
  }

  function elegir(m: Municipio) {
    setTexto(m.ciudad);
    onSelect(m.ciudad, m.departamento);
    setAbierto(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); abrir(e.target.value); }}
        onFocus={() => abrir(texto)}
        placeholder={placeholder}
        className={INPUT_CLS}
        autoComplete="off"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-[100] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#e1e9dd] bg-white py-1 shadow-lg">
          {resultados.map((m) => (
            <li key={`${m.ciudad}|${m.departamento}`}>
              <button
                type="button"
                onClick={() => elegir(m)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-[#45505e] transition hover:bg-[#f7faf5]"
              >
                <span className="font-medium text-[#14352a]">{m.ciudad}</span>
                <span className="shrink-0 text-xs text-[#7a8794]">{m.departamento}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
