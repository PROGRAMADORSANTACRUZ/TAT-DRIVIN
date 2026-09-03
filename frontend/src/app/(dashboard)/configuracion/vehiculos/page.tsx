"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getVehiculosExternos,
  setCapacidadReal,
  type VehiculoExterno,
} from "@/lib/api";
import SearchInput from "@/components/SearchInput";

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editando, setEditando] = useState<VehiculoExterno | null>(null);
  const [valorReal, setValorReal] = useState("");
  const [valorCubicaje, setValorCubicaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setVehiculos(await getVehiculosExternos());
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

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function abrirEditar(v: VehiculoExterno) {
    setEditando(v);
    setValorReal(v.capacidadReal ?? "");
    setValorCubicaje(v.cubicaje ?? "");
    setError(null);
  }

  async function guardarCapacidadReal() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    try {
      const real = valorReal.trim();
      const cub = valorCubicaje.trim();
      await setCapacidadReal(
        editando.placa,
        real === "" ? null : real,
        cub === "" ? null : cub
      );
      setEditando(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? vehiculos.filter((v) =>
        [v.placa, v.conductor, v.flotas, v.empleadores].some((f) =>
          f?.toLowerCase().includes(term)
        )
      )
    : vehiculos;

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex shrink-0 flex-col gap-1">
        <h1 className="text-2xl font-bold text-[#14352a]">Vehículos</h1>
        <p className="text-sm text-[#5f7a68]">
          Vehículos sincronizados desde Drivin.
        </p>
      </header>

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por placa, conductor o flota…"
          className="w-full max-w-sm"
        />

        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-[#b3261e]">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#5f7a68]">
            No se encontraron vehículos.
          </p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-auto pb-4">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((v) => (
                <div
                  key={v.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* Cabecera oscura con placa estilo colombiano */}
                  <div className="flex items-center gap-4 bg-[#14352a] px-5 py-4">
                    <div className="flex flex-col items-center justify-center rounded-lg border-4 border-yellow-400 bg-yellow-300 px-3 py-1.5 shadow-inner">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#14352a]">
                        Colombia
                      </span>
                      <span className="text-lg font-extrabold leading-none tracking-widest text-[#14352a]">
                        {v.placa}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {v.conductor || "Sin conductor"}
                      </p>
                      <p className="truncate text-xs text-[#a7c4b5]">
                        {v.flotas || v.empleadores || "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        v.estado === "Activo"
                          ? "bg-[#e8f3e2] text-[#2f8f4e]"
                          : "bg-[#3a4a3f] text-[#c0cabf]"
                      }`}
                    >
                      {v.estado}
                    </span>
                  </div>

                  {/* Cuerpo con métricas */}
                  <div className="grid grid-cols-3 divide-x divide-[#f0f2ee] border-b border-[#f0f2ee]">
                    <div className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#9aa4af]">
                        Cap. tarjeta
                      </span>
                      <span className="text-base font-bold text-[#14352a]">
                        {v.capacidad ? `${v.capacidad}` : "—"}
                        {v.capacidad && <span className="text-xs font-medium text-[#7a8794]"> kg</span>}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#9aa4af]">
                        Cap. real
                      </span>
                      <span className={`text-base font-bold ${v.capacidadReal ? "text-[#2f8f4e]" : "text-[#c0c9bf]"}`}>
                        {v.capacidadReal ? `${v.capacidadReal}` : "—"}
                        {v.capacidadReal && <span className="text-xs font-medium text-[#7a8794]"> kg</span>}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#9aa4af]">
                        Cubicaje
                      </span>
                      <span className={`text-base font-bold ${v.cubicaje ? "text-[#1a5fb4]" : "text-[#c0c9bf]"}`}>
                        {v.cubicaje ? `${v.cubicaje}` : "—"}
                        {v.cubicaje && <span className="text-xs font-medium text-[#7a8794]"> m³</span>}
                      </span>
                    </div>
                  </div>

                  {/* Pie con detalle + editar */}
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs text-[#7a8794]">
                      {v.modelo || "—"}{v.anio ? ` · ${v.anio}` : ""}
                    </span>
                    <button
                      onClick={() => abrirEditar(v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] bg-white px-3 py-1.5 text-xs font-medium text-[#45505e] transition-colors hover:border-[#2f8f4e] hover:bg-[#f2f8ef] hover:text-[#2f8f4e]"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="shrink-0 pt-2 text-sm text-[#5f7a68]">
            <span>{filtered.length} vehículos</span>
          </div>
        )}
      </section>

      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">
                Editar vehículo
              </h3>
              <p className="mt-0.5 text-sm text-[#5f7a68]">
                {editando.placa} · {editando.conductor ?? "Sin conductor"}
              </p>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex items-center justify-between rounded-lg bg-[#f7faf5] px-3 py-2.5 text-sm">
                <span className="text-[#7a8794]">Capacidad en tarjeta (Drivin)</span>
                <span className="font-medium text-[#14352a]">
                  {editando.capacidad ? `${editando.capacidad} kg` : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#14352a]">
                  Capacidad real (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={valorReal}
                  autoFocus
                  onChange={(e) => setValorReal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardarCapacidadReal()}
                  placeholder="Deja vacío para usar la de Drivin"
                  className="w-full rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition placeholder:text-[#a6b0a9] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#14352a]">
                  Cubicaje (m³)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={valorCubicaje}
                  onChange={(e) => setValorCubicaje(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardarCapacidadReal()}
                  placeholder="Volumen del vehículo en metros cúbicos"
                  className="w-full rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition placeholder:text-[#a6b0a9] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
                <p className="text-xs text-[#7a8794]">
                  La capacidad real y el cubicaje son los únicos campos editables.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={() => setEditando(null)}
                disabled={guardando}
                className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCapacidadReal}
                disabled={guardando}
                className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#277a42] disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
