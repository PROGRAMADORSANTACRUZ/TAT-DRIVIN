"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tc, btn } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import ClienteFormModal from "@/components/cliente/ClienteFormModal";
import {
  ApiError,
  getClientes,
  importClientes,
  exportClientes,
  eliminarTodosClientes,
  type Cliente,
} from "@/lib/api";

// Fila para mostrar en la tabla (mapeada desde Cliente).
type Row = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  pais: string | null;
  cliente: Cliente;
};

function fromGS(c: Cliente): Row {
  return {
    id: c.id,
    codigo: c.codigoDireccion,
    nombre: c.cliente || c.nombreDireccion,
    direccion: c.direccion,
    ciudad: c.provincia,
    departamento: c.region,
    pais: c.pais,
    cliente: c,
  };
}

// Etiqueta a mostrar según el tipo del cliente.
function badgeTipo(r: Row): "TAT" | "Distribución" {
  return r.cliente.tipo === "TAT" ? "TAT" : "Distribución";
}

const COLUMNS: { key: keyof Row; label: string }[] = [
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Cliente / Razón social" },
  { key: "direccion", label: "Dirección" },
  { key: "ciudad", label: "Ciudad" },
  { key: "departamento", label: "Departamento" },
  { key: "pais", label: "País" },
];

export default function ClientesPage() {
  const [clientesGS, setClientesGS] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [eliminandoTodo, setEliminandoTodo] = useState(false);
  const [confirmarEliminarTodo, setConfirmarEliminarTodo] = useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | "GS" | "TAT">("");
  const [editingGS, setEditingGS] = useState<Cliente | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClientesGS(await getClientes());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const r = await importClientes(file);
      setMessage(
        `Importación: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios.` +
          (r.descartadas ? ` ${r.descartadas} filas descartadas (sin código/nombre).` : "") +
          " Los clientes que no venían en el archivo NO se tocaron."
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    setMessage(null);
    try {
      await exportClientes();
      setMessage("Excel de clientes descargado. Edítalo y vuelve a importarlo para actualizar la info.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  async function handleEliminarTodo() {
    setEliminandoTodo(true);
    setError(null);
    setMessage(null);
    try {
      const r = await eliminarTodosClientes();
      setMessage(`Se eliminaron ${r.eliminados} clientes de Distribución.`);
      setConfirmarEliminarTodo(false);
      setTextoConfirmacion("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar");
    } finally {
      setEliminandoTodo(false);
    }
  }

  const rows: Row[] = clientesGS.map(fromGS);
  const term = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (tipoFiltro) {
      const esTat = badgeTipo(r) === "TAT";
      if (tipoFiltro === "TAT" && !esTat) return false;
      if (tipoFiltro === "GS" && esTat) return false;
    }
    if (
      term &&
      ![r.codigo, r.nombre, r.direccion, r.ciudad, r.departamento].some((f) =>
        f?.toLowerCase().includes(term)
      )
    )
      return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">Clientes</h1>
          <p className="text-sm text-[#5f7a68]">
            Maestro de clientes. Descárgalo en Excel, actualiza la info y vuelve a importarlo.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmarEliminarTodo(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#f0c4c1] bg-white px-4 py-2.5 text-sm font-medium text-[#b3261e] transition-colors hover:bg-[#fbeceb]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Eliminar toda la BD
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={btn}
          >
            {exporting ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {exporting ? "Descargando…" : "Descargar Excel"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={btn}
          >
            {importing ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {importing ? "Importando…" : "Importar Excel"}
          </button>
        </div>
      </header>

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">
          {message}
        </div>
      )}

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por código, nombre, dirección o ciudad…"
          className="w-full max-w-sm"
        />
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as "" | "GS" | "TAT")}
          className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
        >
          <option value="">Todos los tipos</option>
          <option value="GS">Distribución</option>
          <option value="TAT">TAT</option>
        </select>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-[#b3261e]">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#5f7a68]">
            No hay clientes. Usa{" "}
            <span className="font-medium">Importar Excel</span> para cargarlos (puedes partir de{" "}
            <span className="font-medium">Descargar Excel</span>).
          </p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-3 font-semibold">Tipo</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-3 py-3 font-semibold">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setEditingGS(r.cliente)}
                    className="cursor-pointer hover:bg-[#f9fbf7]"
                  >
                    <td className="px-3 py-3">
                      {badgeTipo(r) === "TAT" ? (
                        <span className="inline-flex rounded-full bg-[#fef3e6] px-2.5 py-0.5 text-xs font-medium text-[#b5731e]">
                          TAT
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">
                          Distribución
                        </span>
                      )}
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${
                          col.key === "codigo" || col.key === "nombre"
                            ? "font-medium text-[#14352a]"
                            : "text-[#45505e]"
                        }`}
                      >
                        {tc(r[col.key] as string) || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3 text-sm text-[#5f7a68]">
            <span>{filtered.length} registros</span>
          </div>
        )}
      </section>

      {editingGS && (
        <ClienteFormModal
          modo="editarGS"
          gs={editingGS}
          onClose={() => setEditingGS(null)}
          onSaved={() => {
            setEditingGS(null);
            load();
          }}
        />
      )}

      {confirmarEliminarTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-[#eceef0] px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbeceb] text-[#b3261e]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[#14352a]">Eliminar toda la base de clientes</h3>
                  <p className="text-sm text-[#5f7a68]">Esta acción no se puede deshacer</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="mb-3 text-sm text-[#45505e]">
                Se eliminarán <strong>todos</strong> los clientes de Distribución ({clientesGS.length} registros).
                Los clientes TAT no se ven afectados. Para confirmar, escribe <strong>ELIMINAR</strong> abajo.
              </p>
              <input
                autoFocus
                value={textoConfirmacion}
                onChange={(e) => setTextoConfirmacion(e.target.value)}
                placeholder="ELIMINAR"
                className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#b3261e]"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={() => { setConfirmarEliminarTodo(false); setTextoConfirmacion(""); }}
                disabled={eliminandoTodo}
                className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarTodo}
                disabled={eliminandoTodo || textoConfirmacion.trim().toUpperCase() !== "ELIMINAR"}
                className="rounded-lg bg-[#b3261e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#941f18] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {eliminandoTodo ? "Eliminando…" : "Eliminar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
