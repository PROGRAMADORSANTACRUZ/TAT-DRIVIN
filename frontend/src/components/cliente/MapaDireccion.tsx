"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl bg-[#f7faf5] text-sm text-[#7a8794]">
      Cargando mapa…
    </div>
  ),
});

const CENTRO_POR_DEFECTO = { lat: 10.9685, lng: -74.7813 }; // Barranquilla

interface Estado {
  tipo: "ok" | "error" | "info";
  msg: string;
}

interface SugerenciaGeo {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

function soloVia(direccion: string): string {
  return direccion.split("#")[0].replace(/\s+/g, " ").trim();
}

function extraerConjunto(referencia?: string): string {
  const ref = (referencia ?? "").trim();
  if (!ref) return "";
  const primero = ref.split(" - ")[0].trim();
  if (/^(apto|apartamento|b\d|bloque|t\d|torre|p\d|piso)\b/i.test(primero)) return "";
  return primero;
}

function normaliza(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function construirConsultas(direccion: string, barrio: string, ciudad: string, conjunto = ""): string[] {
  const dir = direccion.trim();
  const via = soloVia(dir);
  const b = barrio.trim();
  const ci = ciudad.trim();
  const co = conjunto.trim();
  const arma = (partes: string[]) => partes.filter(Boolean).join(", ");
  const consultas = [
    ...(co ? [arma([co, b, ci, "Colombia"]), arma([co, ci, "Colombia"])] : []),
    arma([dir, ci, "Colombia"]),
    arma([via, ci, "Colombia"]),
    arma([dir, b, ci, "Colombia"]),
    arma([via, b, ci, "Colombia"]),
    arma([b, ci, "Colombia"]),
    arma([ci, "Colombia"]),
  ];
  return [...new Set(consultas)].filter((q) => q && q !== "Colombia");
}

async function consultarNominatim(q: string, limit: number): Promise<SugerenciaGeo[]> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=co&limit=${limit}&addressdetails=1&q=${encodeURIComponent(q)}`,
    { headers: { "Accept-Language": "es" } }
  );
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export default function MapaDireccion({
  direccion,
  barrio,
  ciudad,
  referencia,
  lat,
  lng,
  onUbicacion,
  onBarrio,
  onCiudad,
  altoMapa = 220,
}: {
  direccion: string;
  barrio: string;
  ciudad: string;
  referencia?: string;
  lat: number | null;
  lng: number | null;
  onUbicacion: (lat: number | null, lng: number | null) => void;
  onBarrio?: (barrio: string) => void;
  onCiudad?: (ciudad: string) => void;
  altoMapa?: number;
}) {
  const [abierto, setAbierto] = useState(lat != null && lng != null);
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [sugerencia, setSugerencia] = useState("");
  const [sugerencias, setSugerencias] = useState<SugerenciaGeo[]>([]);
  const [modalSug, setModalSug] = useState(false);
  const [cargandoSug, setCargandoSug] = useState(false);

  const hayInfo = Boolean(direccion.trim() || barrio.trim() || ciudad.trim());

  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(null), 5000);
    return () => clearTimeout(t);
  }, [estado]);

  async function geocodificar() {
    if (!hayInfo) {
      setEstado({ tipo: "error", msg: "Escribe la dirección primero." });
      return;
    }
    const consultas = construirConsultas(direccion, barrio, ciudad, extraerConjunto(referencia));
    setCargando(true);
    setEstado(null);
    try {
      let conCalle: SugerenciaGeo | null = null;
      let respaldo: SugerenciaGeo | null = null;
      for (const q of consultas) {
        const data = await consultarNominatim(q, 5);
        const calle = data.find((s) => s.address?.road);
        if (calle) {
          conCalle = calle;
          break;
        }
        if (!respaldo && data.length > 0) respaldo = data[0];
      }
      const encontrado = conCalle ?? respaldo;
      if (encontrado) {
        const la = parseFloat(encontrado.lat);
        const lo = parseFloat(encontrado.lon);
        onUbicacion(la, lo);
        setSugerencia(encontrado.display_name ?? "");
        setAbierto(true);
        const a = encontrado.address ?? {};
        const barrioReal = a.neighbourhood || a.suburb || a.quarter || a.residential || a.city_district || "";
        if (!conCalle) {
          setEstado({ tipo: "info", msg: "Solo se ubicó el sector. Verifica en el mapa o usa 'Ver sugerencias'." });
        } else if (barrio.trim() && barrioReal && normaliza(barrioReal) !== normaliza(barrio)) {
          setEstado({ tipo: "info", msg: `Esa vía figura en el barrio "${barrioReal}", no en "${barrio}". Revisa "Ver sugerencias".` });
        } else {
          setEstado({ tipo: "ok", msg: "Dirección encontrada en el mapa." });
        }
      } else {
        setAbierto(true);
        setEstado({ tipo: "error", msg: "No se encontró. Ubícala manualmente en el mapa." });
      }
    } catch {
      setEstado({ tipo: "error", msg: "No se pudo consultar el mapa." });
    } finally {
      setCargando(false);
    }
  }

  function quitarUbicacion() {
    onUbicacion(null, null);
    setSugerencia("");
    setEstado(null);
    setAbierto(false);
  }

  async function verSugerencias() {
    if (!hayInfo) {
      setEstado({ tipo: "error", msg: "Escribe algo de la dirección, barrio o ciudad." });
      return;
    }
    const consultas = construirConsultas(direccion, barrio, ciudad, extraerConjunto(referencia));
    setCargandoSug(true);
    setEstado(null);
    try {
      const vistos = new Set<string>();
      const acumulado: SugerenciaGeo[] = [];
      for (const q of consultas) {
        const data = await consultarNominatim(q, 8);
        for (const s of data) {
          const clave = `${s.lat},${s.lon}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          acumulado.push(s);
        }
        if (acumulado.filter((s) => s.address?.road).length >= 6) break;
      }
      acumulado.sort((a, b) => (a.address?.road ? 0 : 1) - (b.address?.road ? 0 : 1));
      const lista = acumulado.slice(0, 8);
      setSugerencias(lista);
      setModalSug(true);
      if (lista.length === 0) {
        setEstado({ tipo: "error", msg: "No se encontraron sugerencias. Ubica manualmente." });
      }
    } catch {
      setEstado({ tipo: "error", msg: "No se pudo consultar las sugerencias." });
    } finally {
      setCargandoSug(false);
    }
  }

  function elegirSugerencia(s: SugerenciaGeo) {
    const la = parseFloat(s.lat);
    const lo = parseFloat(s.lon);
    if (!Number.isNaN(la) && !Number.isNaN(lo)) onUbicacion(la, lo);
    const a = s.address ?? {};
    const nuevoBarrio = a.neighbourhood || a.suburb || a.quarter || a.residential || a.city_district || "";
    const nuevaCiudad = a.city || a.town || a.municipality || a.village || a.county || "";
    if (nuevoBarrio && onBarrio) onBarrio(nuevoBarrio);
    if (nuevaCiudad && onCiudad) onCiudad(nuevaCiudad);
    setSugerencia(s.display_name ?? "");
    setAbierto(true);
    setModalSug(false);
    setEstado({ tipo: "ok", msg: "Sugerencia aplicada. Revisa y guarda." });
  }

  const centroLat = lat ?? CENTRO_POR_DEFECTO.lat;
  const centroLng = lng ?? CENTRO_POR_DEFECTO.lng;
  const tieneUbicacion = lat != null && lng != null;

  return (
    <div className="rounded-xl border border-[#e1e9dd] bg-[#f7faf5] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#7a8794]">Ubicación en el mapa</span>
        <div className="flex items-center gap-2">
          {(tieneUbicacion || abierto) && (
            <button
              type="button"
              onClick={quitarUbicacion}
              className="text-xs font-medium text-[#7a8794] hover:text-[#b3261e] hover:underline"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={verSugerencias}
            disabled={cargandoSug || !hayInfo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#a86a12]/50 bg-white px-3 py-1.5 text-xs font-semibold text-[#a86a12] shadow-sm transition hover:bg-[#fdf6e9] disabled:opacity-40"
          >
            {cargandoSug ? "Buscando…" : "Ver sugerencias"}
          </button>
          <button
            type="button"
            onClick={geocodificar}
            disabled={cargando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#a86a12] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#8a560e] disabled:opacity-50"
          >
            {cargando ? "Buscando…" : "Ubicar dirección"}
          </button>
        </div>
      </div>

      {estado && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium text-white ${
            estado.tipo === "ok" ? "bg-[#2f8f4e]" : estado.tipo === "error" ? "bg-[#b3261e]" : "bg-[#a86a12]"
          }`}
        >
          {estado.msg}
        </div>
      )}

      {abierto && (
        <div className="mt-2 overflow-hidden rounded-xl">
          <MapaLeaflet
            lat={centroLat}
            lng={centroLng}
            height={altoMapa}
            onMover={(la, lo) => {
              onUbicacion(la, lo);
              setEstado({ tipo: "ok", msg: "Ubicación ajustada. Guarda para conservar." });
            }}
          />
          <p className="mt-1 text-[0.7rem] text-[#7a8794]">
            Arrastra el pin o haz clic en el mapa para ajustar la ubicación exacta.
          </p>
          {sugerencia && (
            <p className="mt-1 line-clamp-1 text-[0.7rem] text-[#7a8794]">
              <span className="font-medium">Mapa:</span> {sugerencia}
            </p>
          )}
          {tieneUbicacion && (
            <p className="mt-0.5 text-[0.7rem] text-[#9aa7ad]">
              Lat {lat!.toFixed(6)}, Lng {lng!.toFixed(6)}
            </p>
          )}
        </div>
      )}

      {modalSug && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setModalSug(false)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#14352a]">Sugerencias de dirección</h4>
              <button onClick={() => setModalSug(false)} className="rounded p-1 text-[#7a8794] hover:bg-[#f4f6f3]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {sugerencias.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => elegirSugerencia(s)}
                    className="w-full rounded-lg border border-[#e1e9dd] px-3 py-2 text-left text-xs text-[#45505e] transition hover:border-[#2f8f4e] hover:bg-[#f7faf5]"
                  >
                    {s.display_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
