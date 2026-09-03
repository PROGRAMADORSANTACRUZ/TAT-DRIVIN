"use client";

import { useEffect, useState } from "react";
import { RUTAS_BASE, type Ruta } from "@/data/planillaConfig";
import { getRutas, saveRutas } from "@/lib/api";

const GRUPOS = ["PDV CASA", "Cartagena", "Santa Marta", "Poblaciones", "Local", "Inversiones", "Clientes Varios"];

let nextId = 2000;
function newId() { return `ruta-${++nextId}-${Date.now()}`; }

export default function RutasPage() {
  const [lista, setLista] = useState<Ruta[]>([]);
  const [editando, setEditando] = useState<Ruta | null>(null);
  const [creando, setCreando] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRutas()
      .then((data) => setLista(data as Ruta[]))
      .catch((err) => { console.error(err); setError("No se pudieron cargar las rutas"); });
  }, []);

  async function persistir(next: Ruta[]) {
    setLista(next);
    try {
      const saved = await saveRutas(next);
      setLista(saved as Ruta[]);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  }

  function guardar(data: Omit<Ruta, "id">) {
    let next: Ruta[];
    if (editando) {
      next = lista.map((r) => r.id === editando.id ? { ...editando, ...data } : r);
    } else {
      next = [...lista, { id: newId(), ...data }];
    }
    void persistir(next);
    setEditando(null);
    setCreando(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function eliminar(id: string) {
    void persistir(lista.filter((r) => r.id !== id));
  }

  const filtrado = lista.filter((r) => {
    if (filtroGrupo && r.grupo !== filtroGrupo) return false;
    if (buscar && ![r.nombre, r.ciudad, r.recorrido, r.grupo].some((f) => f?.toLowerCase().includes(buscar.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Rutas de despacho</h1>
          <p className="text-sm text-[#5f7a68]">Gestiona las rutas disponibles en los selectores de planilla.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-[#2f8f4e]">✓ Guardado</span>}
          {error && <span className="text-sm text-[#b3261e]">{error}</span>}
          <button onClick={() => { void persistir(RUTAS_BASE); }} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#45505e] hover:bg-[#f4f6f3]">
            Restaurar originales
          </button>
          <button onClick={() => { setCreando(true); setEditando(null); }} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva ruta
          </button>
        </div>
      </header>

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <input
          type="text"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar ruta, ciudad…"
          className="w-56 rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
        />
        <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
          <option value="">Todos los grupos</option>
          {GRUPOS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="text-xs text-[#7a8794]">{filtrado.length} rutas</span>
      </div>

      <div className="nice-scroll min-h-0 flex-1 overflow-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <table className="w-full table-auto text-sm">
          <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold">Grupo</th>
              <th className="px-4 py-3 text-left font-semibold">Ciudad</th>
              <th className="px-4 py-3 text-left font-semibold">Recorrido</th>
              <th className="px-4 py-3 text-center font-semibold">Km</th>
              <th className="px-4 py-3 text-center font-semibold">Tiempo</th>
              <th className="px-4 py-3 text-center font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f2ee]">
            {filtrado.map((r) => (
              <tr key={r.id} className="hover:bg-[#f9fbf7]">
                <td className="px-4 py-2.5 font-medium text-[#14352a]">{r.nombre}</td>
                <td className="px-4 py-2.5">
                  {r.grupo && (
                    <span className="rounded-full bg-[#f2f5ef] px-2.5 py-0.5 text-xs text-[#5f7a68]">{r.grupo}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[#45505e]">{r.ciudad || "—"}</td>
                <td className="max-w-xs px-4 py-2.5 text-xs text-[#7a8794]">
                  <span className="line-clamp-1">{r.recorrido || "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-center text-[#45505e]">{r.kls ?? "—"}</td>
                <td className="px-4 py-2.5 text-center text-[#45505e]">{r.tiempo || "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => { setEditando(r); setCreando(false); }} className="rounded-lg border border-[#f0d9b0] bg-[#fdf6e9] px-3 py-1 text-xs font-medium text-[#a86a12] hover:bg-[#faedd4]">Editar</button>
                    <button onClick={() => eliminar(r.id)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-1 text-xs font-medium text-[#b3261e] hover:bg-[#fbeceb]">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrado.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#7a8794]">No hay rutas para el filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(creando || editando) && (
        <RutaModal
          ruta={editando}
          onClose={() => { setCreando(false); setEditando(null); }}
          onSave={guardar}
        />
      )}
    </div>
  );
}

function RutaModal({ ruta, onClose, onSave }: {
  ruta: Ruta | null;
  onClose: () => void;
  onSave: (data: Omit<Ruta, "id">) => void;
}) {
  const [nombre, setNombre] = useState(ruta?.nombre ?? "");
  const [ciudad, setCiudad] = useState(ruta?.ciudad ?? "");
  const [recorrido, setRecorrido] = useState(ruta?.recorrido ?? "");
  const [kls, setKls] = useState(ruta?.kls?.toString() ?? "");
  const [tiempo, setTiempo] = useState(ruta?.tiempo ?? "");
  const [grupo, setGrupo] = useState(ruta?.grupo ?? "");

  const inputCls = "rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-[#14352a]">{ruta ? "Editar ruta" : "Nueva ruta"}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-xs font-medium text-[#7a8794]">Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. R1 - PDV CASA" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Ciudad / Destino</span>
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="BARRANQUILLA" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Grupo</span>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={inputCls}>
              <option value="">Sin grupo</option>
              {GRUPOS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-xs font-medium text-[#7a8794]">Recorrido</span>
            <input value={recorrido} onChange={(e) => setRecorrido(e.target.value)} placeholder="Malambo-Soledad-Barranquilla" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Kilómetros</span>
            <input type="number" value={kls} onChange={(e) => setKls(e.target.value)} placeholder="0" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Tiempo estimado</span>
            <input value={tiempo} onChange={(e) => setTiempo(e.target.value)} placeholder="1h 30 min" className={inputCls} />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button
            onClick={() => nombre.trim() && onSave({ nombre: nombre.trim(), ciudad: ciudad.trim() || undefined, recorrido: recorrido.trim() || undefined, kls: kls ? Number(kls) : undefined, tiempo: tiempo.trim() || undefined, grupo: grupo || undefined })}
            className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
