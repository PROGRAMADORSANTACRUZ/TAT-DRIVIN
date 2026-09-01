"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tc, btn } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import ClienteFormModal from "@/components/cliente/ClienteFormModal";
import {
  ApiError,
  getClientes,
  getClientesTat,
  importClientes,
  syncClientesTat,
  type Cliente,
  type ClienteTat,
} from "@/lib/api";

type Tipo = "GS" | "TAT";

// Fila unificada que representa un cliente de cualquiera de las dos fuentes.
type Row = {
  id: string;
  tipo: Tipo;
  codigo: string | null;
  nombre: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  pais: string | null;
  gs?: Cliente;
  tat?: ClienteTat;
};

function fromGS(c: Cliente): Row {
  return {
    id: `gs-${c.id}`,
    tipo: "GS",
    codigo: c.codigoDireccion,
    nombre: c.cliente || c.nombreDireccion,
    direccion: c.direccion,
    ciudad: c.comuna,
    departamento: c.provincia,
    pais: c.pais,
    gs: c,
  };
}

function fromTat(c: ClienteTat): Row {
  return {
    id: `tat-${c.id}`,
    tipo: "TAT",
    codigo: c.codigoTercero,
    nombre: c.razonSocial,
    direccion: c.direccion1,
    ciudad: c.ciudad,
    departamento: c.departamento,
    pais: c.pais,
    tat: c,
  };
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
  const [clientesTat, setClientesTat] = useState<ClienteTat[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | Tipo>("");
  const [editingGS, setEditingGS] = useState<Cliente | null>(null);
  const [editingTat, setEditingTat] = useState<ClienteTat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [gs, tat] = await Promise.all([getClientes(), getClientesTat()]);
      setClientesGS(gs);
      setClientesTat(tat);
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
      const { importados } = await importClientes(file);
      setMessage(`Se importaron ${importados} clientes de Grandes Superficies.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const { creados, actualizados, preservados } = await syncClientesTat();
      setMessage(
        `TAT: ${creados} nuevos, ${actualizados} actualizados, ${preservados} conservados.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  const rows: Row[] = [
    ...clientesGS.map(fromGS),
    ...clientesTat.map(fromTat),
  ];
  const term = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (tipoFiltro && r.tipo !== tipoFiltro) return false;
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
    <div className="flex h-full flex-col p-6 sm:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">Clientes</h1>
          <p className="text-sm text-[#5f7a68]">
            Maestro unificado de Grandes Superficies y TAT.
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
            onClick={handleSync}
            disabled={syncing}
            className={btn}
          >
            {syncing ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            )}
            {syncing ? "Sincronizando…" : "Sincronizar TAT"}
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
            {importing ? "Importando…" : "Importar Grandes Superficies"}
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
          onChange={(e) => setTipoFiltro(e.target.value as "" | Tipo)}
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
            <span className="font-medium">Importar Grandes Superficies</span> o{" "}
            <span className="font-medium">Sincronizar TAT</span> para cargarlos.
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
                    onClick={() =>
                      r.tipo === "GS" ? setEditingGS(r.gs!) : setEditingTat(r.tat!)
                    }
                    className="cursor-pointer hover:bg-[#f9fbf7]"
                  >
                    <td className="px-3 py-3">
                      {r.tipo === "TAT" ? (
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
      {editingTat && (
        <ClienteFormModal
          modo="editarTAT"
          tat={editingTat}
          onClose={() => setEditingTat(null)}
          onSaved={() => {
            setEditingTat(null);
            load();
          }}
          onDeleted={() => {
            setEditingTat(null);
            load();
          }}
        />
      )}
    </div>
  );
}
