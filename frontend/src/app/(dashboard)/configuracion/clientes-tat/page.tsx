"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { tc, btn, btnSm } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import {
  ApiError,
  deleteClienteTat,
  getClientesTat,
  syncClientesTat,
  updateClienteTat,
  type ClienteTat,
  type ClienteTatInput,
} from "@/lib/api";

const COLUMNS: { key: keyof ClienteTat; label: string }[] = [
  { key: "codigoTercero", label: "Código" },
  { key: "nit", label: "NIT" },
  { key: "razonSocial", label: "Razón social" },
  { key: "sucursal", label: "Sucursal" },
  { key: "descripcionSucursal", label: "Descripción sucursal" },
  { key: "direccion1", label: "Dirección" },
  { key: "barrio", label: "Barrio" },
  { key: "ciudad", label: "Ciudad" },
  { key: "departamento", label: "Departamento" },
  { key: "pais", label: "País" },
  { key: "telefono", label: "Teléfono" },
  { key: "celular", label: "Celular" },
  { key: "correo", label: "Correo" },
  { key: "idVendedor", label: "ID vendedor" },
  { key: "vendedor", label: "Vendedor" },
  { key: "idCriterio", label: "ID criterio" },
  { key: "criterio", label: "Criterio" },
];

const FORM_FIELDS: { key: keyof ClienteTatInput; label: string }[] = COLUMNS.map(
  (c) => ({ key: c.key as keyof ClienteTatInput, label: c.label })
);

export default function ClientesTatPage() {
  const [clientes, setClientes] = useState<ClienteTat[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editando, setEditando] = useState<ClienteTat | null>(null);
  const [form, setForm] = useState<ClienteTatInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClientes(await getClientesTat());
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

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const { creados, actualizados, preservados } = await syncClientesTat();
      setMessage(
        `Sincronización lista: ${creados} nuevos, ${actualizados} actualizados, ${preservados} conservados (editados manualmente).`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  function openEdit(c: ClienteTat) {
    setEditando(c);
    setFormError(null);
    setForm({
      codigoTercero: c.codigoTercero,
      nit: c.nit,
      razonSocial: c.razonSocial,
      sucursal: c.sucursal,
      descripcionSucursal: c.descripcionSucursal,
      direccion1: c.direccion1,
      barrio: c.barrio,
      ciudad: c.ciudad,
      departamento: c.departamento,
      pais: c.pais,
      telefono: c.telefono,
      celular: c.celular,
      correo: c.correo,
      idVendedor: c.idVendedor,
      vendedor: c.vendedor,
      idCriterio: c.idCriterio,
      criterio: c.criterio,
      referencia: c.referencia,
      lat: c.lat,
      lon: c.lon,
      puntoVenta: c.puntoVenta,
      tipo: c.tipo,
    });
  }

  function closeEdit() {
    setEditando(null);
    setForm(null);
    setFormError(null);
  }

  async function handleSaveEdit() {
    if (!editando || !form) return;
    setSaving(true);
    setFormError(null);
    try {
      await updateClienteTat(editando.id, form);
      setMessage(`Cliente "${form.razonSocial ?? editando.id}" actualizado.`);
      closeEdit();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: ClienteTat) {
    if (
      !window.confirm(
        `¿Eliminar el cliente "${c.razonSocial ?? c.codigoTercero ?? ""}"? No volverá a aparecer aunque sincronices.`
      )
    )
      return;
    setEliminandoId(c.id);
    setError(null);
    setMessage(null);
    try {
      await deleteClienteTat(c.id);
      setMessage(`Cliente "${c.razonSocial ?? c.id}" eliminado.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar");
    } finally {
      setEliminandoId(null);
    }
  }

  // El tipeo se mantiene fluido; el filtrado de miles de filas se difiere.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    if (!term) return clientes;
    return clientes.filter((c) =>
      [c.razonSocial, c.nit, c.codigoTercero, c.ciudad, c.vendedor].some((f) =>
        f?.toLowerCase().includes(term)
      )
    );
  }, [clientes, deferredSearch]);

  return (
    <div className="flex h-full flex-col p-6 sm:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">Clientes TAT</h1>
          <p className="text-sm text-[#5f7a68]">
            Clientes sincronizados desde la API de Grupo Santacruz.
          </p>
        </div>

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
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      </header>

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">
          {message}
        </div>
      )}

      <div className="mb-4 shrink-0">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por razón social, NIT, ciudad o vendedor…"
          className="w-full max-w-sm"
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-[#b3261e]">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#5f7a68]">
            No hay clientes. Usa{" "}
            <span className="font-medium">Sincronizar</span> para cargarlos desde
            la API.
          </p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1800px] table-auto text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-3 py-3 font-semibold">
                      {col.label}
                    </th>
                  ))}
                  <th className="sticky right-0 bg-[#f7faf5] px-3 py-3 font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f9fbf7]">
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`whitespace-nowrap px-3 py-3 ${
                          col.key === "codigoTercero" || col.key === "razonSocial"
                            ? "font-medium text-[#14352a]"
                            : "text-[#45505e]"
                        }`}
                      >
                        {col.key === "razonSocial" && c.editado ? (
                          <span className="flex items-center gap-2">
                            {tc(c[col.key]) || "—"}
                            <span className="rounded-full bg-[#eaf1ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2a5bd7]">
                              Editado
                            </span>
                          </span>
                        ) : (
                          tc(c[col.key]) || "—"
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 bg-white px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(c)}
                          className={btnSm}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                          </svg>
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={eliminandoId === c.id}
                          className={btnSm}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          {eliminandoId === c.id ? "Eliminando…" : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3 text-sm text-[#5f7a68]">
            <span>{filtered.length} clientes</span>
          </div>
        )}
      </section>

      {editando && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-[#14352a]">Editar cliente</h2>
                <p className="text-sm text-[#5f7a68]">
                  Los cambios se conservan aunque vuelvas a sincronizar.
                </p>
              </div>
              <button
                onClick={closeEdit}
                className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f2f6ef]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="nice-scroll grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto px-6 py-5 sm:grid-cols-2">
              {FORM_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#5f7a68]">{f.label}</span>
                  <input
                    type="text"
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, [f.key]: e.target.value } : prev
                      )
                    }
                    className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none transition placeholder:text-[#a6b0a9] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                  />
                </label>
              ))}
            </div>

            {formError && (
              <div className="mx-6 mb-2 shrink-0 rounded-lg border border-[#f0d4d1] bg-[#fbeceb] px-4 py-2 text-sm text-[#b3261e]">
                {formError}
              </div>
            )}

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={closeEdit}
                disabled={saving}
                className={btn}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className={btn}
              >
                {saving && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
                  </svg>
                )}
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
