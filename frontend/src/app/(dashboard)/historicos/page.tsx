"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SearchInput from "@/components/SearchInput";
import { SkeletonStat, SkeletonTable } from "@/components/Loading";
import { ApiError, getPlanillas, type Planilla } from "@/lib/api";
import { docRI, docRIT, imprimirDocumento } from "@/lib/planillaDocs";
import { dlLabel } from "@/lib/utils";

const fmtKg = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Modal para elegir qué documento imprimir (igual que en Planificación D.L).
function ImprimirModal({ planilla, onClose }: { planilla: Planilla; onClose: () => void }) {
  function handleImprimir(doc: () => void) {
    doc();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3e2] text-[#2f8f4e]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#14352a]">Imprimir documentos</h3>
            <p className="text-xs text-[#7a8794]">Plantilla {dlLabel(planilla.consecutivo)} · {planilla.placa}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-[#5f7a68]">¿Qué deseas imprimir?</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => handleImprimir(() => imprimirDocumento(docRI(planilla)))} className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            Imprimir R.I
          </button>
          <button onClick={() => handleImprimir(() => imprimirDocumento(docRIT(planilla)))} className="rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            Imprimir R.I.T
          </button>
        </div>
        <button
          onClick={() => handleImprimir(() => { imprimirDocumento(docRI(planilla)); setTimeout(() => imprimirDocumento(docRIT(planilla)), 700); })}
          className="mt-2 w-full rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#277a42]"
        >
          Imprimir ambos
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium text-[#7a8794] transition-colors hover:bg-[#f4f6f3]">Cerrar</button>
      </div>
    </div>
  );
}

export default function HistoricosPage() {
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [imprimir, setImprimir] = useState<Planilla | null>(null);
  const POR_PAGINA = 20;

  const load = useCallback(async () => {
    setError(null);
    try { setPlanillas(await getPlanillas()); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cargar"); }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const filtrado = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return planillas.filter((p) => {
      if (t && ![String(p.consecutivo), p.placa, p.conductor, p.ruta, p.auxiliarRuta, p.tipoDespacho].some((f) => f?.toLowerCase().includes(t))) return false;
      const iso = p.fecha || new Date(p.createdAt).toISOString().slice(0, 10);
      if (desde && iso < desde) return false;
      if (hasta && iso > hasta) return false;
      return true;
    });
  }, [planillas, buscar, desde, hasta]);

  // Resetear a página 1 cuando cambia el filtro
  useEffect(() => { setPagina(1); }, [buscar, desde, hasta]);

  const totalPaginas = Math.max(1, Math.ceil(filtrado.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas);
  const paginado = useMemo(
    () => filtrado.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA),
    [filtrado, pagActual]
  );

  const totalKilos = useMemo(() => filtrado.reduce((s, p) => s + p.kilos, 0), [filtrado]);
  const totalDocs  = useMemo(() => filtrado.reduce((s, p) => s + p.docs,  0), [filtrado]);

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Históricos de plantillas</h1>
          <p className="text-sm text-[#5f7a68]">Todas las plantillas de despacho generadas.</p>
        </div>
        <Link href="/planificacion-dl" className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Carga de hoy
        </Link>
      </header>

      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : [
          { label: "Plantillas", value: filtrado.length },
          { label: "Documentos", value: totalDocs },
          { label: "Kilos",      value: fmtKg(totalKilos) },
          { label: "Vehículos",  value: new Set(filtrado.map((p) => p.placa)).size },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#14352a]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar consecutivo, placa, conductor, ruta…" className="w-full sm:w-72" />
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-[#7a8794]">
              Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex items-center gap-1.5 text-[#7a8794]">
              Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
          </div>
        </div>

        {loading ? (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Placa</th>
                  <th className="px-4 py-3 font-semibold">Conductor</th>
                  <th className="px-4 py-3 font-semibold">Auxiliar</th>
                  <th className="px-4 py-3 font-semibold">Ruta</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold">Docs</th>
                  <th className="px-4 py-3 text-right font-semibold">Kilos</th>
                  <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <SkeletonTable rows={8} cols={10} />
            </table>
          </div>
        ) : filtrado.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">No hay plantillas para el filtro.</p>
        ) : (
          <div className="nice-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-3 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Placa</th>
                  <th className="px-3 py-3 font-semibold">Conductor</th>
                  <th className="px-3 py-3 font-semibold">Auxiliar</th>
                  <th className="px-3 py-3 font-semibold">Ruta</th>
                  <th className="px-3 py-3 font-semibold">Tipo</th>
                  <th className="px-3 py-3 text-right font-semibold">Docs</th>
                  <th className="px-3 py-3 text-right font-semibold">Kilos</th>
                  <th className="px-3 py-3 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {paginado.map((p) => (
                  <tr key={p.id} className={`hover:bg-[#f9fbf7] ${p.anulada ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3 font-semibold text-[#14352a]">
                      {dlLabel(p.consecutivo)}
                      {p.anulada && <span className="ml-1.5 rounded bg-[#fbeceb] px-1.5 py-0.5 text-[10px] font-bold text-[#b3261e]">ANULADA</span>}
                      {p.anulada && p.reemplazadaPorConsecutivo && (
                        <div className="text-[10px] text-[#7a8794]">Reemplazada por {dlLabel(p.reemplazadaPorConsecutivo)}</div>
                      )}
                      {p.reemplazaDeConsecutivo && (
                        <div className="text-[10px] text-[#2f8f4e]">En reemplazo de {dlLabel(p.reemplazaDeConsecutivo)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.fecha || new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                    <td className="px-3 py-3"><span className="rounded bg-yellow-300 px-2 py-0.5 text-xs font-bold tracking-wider text-[#14352a] ring-1 ring-yellow-400">{p.placa}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.conductor || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.auxiliarRuta || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.ruta || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#45505e]">{p.tipoDespacho || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#45505e]">{p.docs}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#14352a]">{fmtKg(p.kilos)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center">
                        <button onClick={() => setImprimir(p)} title="Imprimir" aria-label="Imprimir" className="inline-flex items-center justify-center rounded-lg border border-[#dfe4e0] bg-white p-2 text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && filtrado.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3">
            <p className="text-xs text-[#7a8794]">
              Mostrando {((pagActual - 1) * POR_PAGINA) + 1}–{Math.min(pagActual * POR_PAGINA, filtrado.length)} de {filtrado.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(1)}
                disabled={pagActual === 1}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                «
              </button>
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagActual === 1}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                ‹
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - pagActual) <= 2)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-xs text-[#7a8794]">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPagina(p as number)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        pagActual === p
                          ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]"
                          : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagActual === totalPaginas}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                ›
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={pagActual === totalPaginas}
                className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-40"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {imprimir && <ImprimirModal planilla={imprimir} onClose={() => setImprimir(null)} />}
    </div>
  );
}
