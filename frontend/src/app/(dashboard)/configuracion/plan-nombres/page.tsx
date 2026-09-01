"use client";

import { useEffect, useState } from "react";

const LS_KEY = "sc_plan_nombres_v1";

type PlanNombre = { id: string; nombre: string; tipo: string };

const TIPOS_DEFECTO: PlanNombre[] = [
  { id: "1", nombre: "Distribución Megatiendas", tipo: "Megatienda" },
  { id: "2", nombre: "Distribución Casa", tipo: "Casa" },
  { id: "3", nombre: "Distribución Éxito", tipo: "Éxito" },
  { id: "4", nombre: "Distribución TAT", tipo: "TAT" },
  { id: "5", nombre: "Distribución Olímpica", tipo: "Olímpica" },
  { id: "6", nombre: "Distribución Isimo", tipo: "Isimo" },
];

function loadData(): PlanNombre[] {
  if (typeof window === "undefined") return TIPOS_DEFECTO;
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "null") ?? TIPOS_DEFECTO; }
  catch { return TIPOS_DEFECTO; }
}
function saveData(data: PlanNombre[]) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }

export function getPlanNombres(): PlanNombre[] { return loadData(); }

export default function PlanNombresPage() {
  const [lista, setLista] = useState<PlanNombre[]>(loadData);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<PlanNombre | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLista(loadData()); }, []);

  function abrirCrear() { setEditItem(null); setNombre(""); setTipo(""); setModalOpen(true); }
  function abrirEditar(p: PlanNombre) { setEditItem(p); setNombre(p.nombre); setTipo(p.tipo); setModalOpen(true); }
  function cerrarModal() { setModalOpen(false); setEditItem(null); setNombre(""); setTipo(""); }

  function guardar() {
    if (!nombre.trim()) return;
    const next = editItem
      ? lista.map((p) => p.id === editItem.id ? { ...p, nombre: nombre.trim(), tipo: tipo.trim() } : p)
      : [...lista, { id: Date.now().toString(), nombre: nombre.trim(), tipo: tipo.trim() }];
    setLista(next);
    saveData(next);
    cerrarModal();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function eliminar(id: string) {
    const next = lista.filter((p) => p.id !== id);
    setLista(next);
    saveData(next);
  }

  function restaurar() { setLista(TIPOS_DEFECTO); saveData(TIPOS_DEFECTO); }

  const hoy = new Date().toLocaleDateString("es-CO");

  return (
    <div className="flex h-full flex-col p-6 sm:p-8">
      <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Nombres de planes</h1>
          <p className="text-sm text-[#5f7a68]">Plantillas de nombres para los planes enviados a Drivin.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-[#2f8f4e]">✓ Guardado</span>}
          <button onClick={restaurar} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#45505e] hover:bg-[#f4f6f3]">
            Restaurar originales
          </button>
          <button onClick={abrirCrear} className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar plantilla
          </button>
        </div>
      </header>

      <div className="nice-scroll min-h-0 flex-1 overflow-auto rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Nombre del plan</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Ejemplo generado</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f2ee]">
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-[#f9fbf7]">
                <td className="px-4 py-3 font-medium text-[#14352a]">{p.nombre}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">{p.tipo}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[#7a8794]">{p.nombre} {hoy}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => abrirEditar(p)} className="rounded border border-[#f0d9b0] bg-[#fdf6e9] px-3 py-1 text-xs text-[#a86a12] hover:bg-[#faedd4]">Editar</button>
                    <button onClick={() => eliminar(p.id)} className="rounded border border-[#dfe4e0] bg-white px-3 py-1 text-xs text-[#b3261e] hover:bg-[#fbeceb]">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrarModal}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-lg font-semibold text-[#14352a]">
              {editItem ? "Editar plantilla" : "Nueva plantilla"}
            </h3>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Nombre del plan *</span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Distribución Megatiendas"
                  autoFocus
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Tipo de despacho</span>
                <input
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  placeholder="Ej. Megatienda"
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
              </label>
              {nombre && (
                <div className="rounded-lg bg-[#f7faf5] px-3 py-2 text-xs text-[#5f7a68]">
                  <span className="font-medium text-[#7a8794]">Ejemplo:</span> {nombre} {hoy}
                </div>
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={cerrarModal} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardar} disabled={!nombre.trim()} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-40">
                {editItem ? "Guardar cambios" : "Crear plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
