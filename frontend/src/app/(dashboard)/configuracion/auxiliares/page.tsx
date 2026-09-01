"use client";

import { useEffect, useState } from "react";
import { AUXILIARES_BASE, type Auxiliar } from "@/data/planillaConfig";
import { getAuxiliares, saveAuxiliares } from "@/lib/api";

let nextId = 1000;
function newId() { return `aux-${++nextId}-${Date.now()}`; }

export default function AuxiliaresPage() {
  const [lista, setLista] = useState<Auxiliar[]>([]);
  const [editando, setEditando] = useState<Auxiliar | null>(null);
  const [creando, setCreando] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuxiliares()
      .then((data) => setLista(data as Auxiliar[]))
      .catch((err) => { console.error(err); setError("No se pudieron cargar los auxiliares"); });
  }, []);

  async function persistir(next: Auxiliar[]) {
    setLista(next);
    try {
      const saved = await saveAuxiliares(next);
      setLista(saved as Auxiliar[]);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  }

  function guardar(data: { nombre: string; telefono?: string }) {
    let next: Auxiliar[];
    if (editando) {
      next = lista.map((a) => a.id === editando.id ? { ...editando, ...data } : a);
    } else {
      next = [...lista, { id: newId(), ...data }];
    }
    next = next.sort((a, b) => a.nombre.localeCompare(b.nombre));
    void persistir(next);
    setEditando(null);
    setCreando(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function eliminar(id: string) {
    void persistir(lista.filter((a) => a.id !== id));
  }

  function resetearBase() {
    void persistir(AUXILIARES_BASE);
  }

  const filtrado = lista.filter((a) =>
    !buscar || a.nombre.toLowerCase().includes(buscar.toLowerCase()) || a.telefono?.includes(buscar)
  );

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 sm:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Auxiliares de ruta</h1>
          <p className="text-sm text-[#5f7a68]">Gestiona los auxiliares disponibles en los selectores de planilla.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-[#2f8f4e]">✓ Guardado</span>}
          {error && <span className="text-sm text-[#b3261e]">{error}</span>}
          <button onClick={resetearBase} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#45505e] hover:bg-[#f4f6f3]">
            Restaurar originales
          </button>
          <button onClick={() => { setCreando(true); setEditando(null); }} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo auxiliar
          </button>
        </div>
      </header>

      <div className="mb-3 shrink-0">
        <input
          type="text"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="w-72 rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
        />
        <span className="ml-3 text-xs text-[#7a8794]">{filtrado.length} auxiliares</span>
      </div>

      <div className="nice-scroll min-h-0 flex-1 overflow-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <table className="w-full table-auto text-sm">
          <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold">Teléfono</th>
              <th className="px-4 py-3 text-center font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f2ee]">
            {filtrado.map((a) => (
              <tr key={a.id} className="hover:bg-[#f9fbf7]">
                <td className="px-4 py-2.5 font-medium text-[#14352a]">{a.nombre}</td>
                <td className="px-4 py-2.5 text-[#45505e]">{a.telefono || "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => { setEditando(a); setCreando(false); }} className="rounded-lg border border-[#f0d9b0] bg-[#fdf6e9] px-3 py-1.5 text-xs font-medium text-[#a86a12] hover:bg-[#faedd4]">Editar</button>
                    <button onClick={() => eliminar(a.id)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-1.5 text-xs font-medium text-[#b3261e] hover:bg-[#fbeceb]">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar */}
      {(creando || editando) && (
        <AuxiliarModal
          auxiliar={editando}
          onClose={() => { setCreando(false); setEditando(null); }}
          onSave={guardar}
        />
      )}
    </div>
  );
}

function AuxiliarModal({ auxiliar, onClose, onSave }: {
  auxiliar: Auxiliar | null;
  onClose: () => void;
  onSave: (data: { nombre: string; telefono?: string }) => void;
}) {
  const [nombre, setNombre] = useState(auxiliar?.nombre ?? "");
  const [telefono, setTelefono] = useState(auxiliar?.telefono ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-[#14352a]">{auxiliar ? "Editar auxiliar" : "Nuevo auxiliar"}</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Aux. Juan Pérez" className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Teléfono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300-0000000" className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
          <button onClick={() => nombre.trim() && onSave({ nombre: nombre.trim(), telefono: telefono.trim() || undefined })} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">Guardar</button>
        </div>
      </div>
    </div>
  );
}
