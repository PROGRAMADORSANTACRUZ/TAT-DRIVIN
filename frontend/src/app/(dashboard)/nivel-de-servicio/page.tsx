"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SearchInput from "@/components/SearchInput";
import { SkeletonStat, SkeletonTable } from "@/components/Loading";
import {
  ApiError,
  crearNovedad,
  editarNovedad,
  getNovedades,
  getOrdenes,
  getPlanillas,
  syncEstadoDrivin,
  type NivelEstado,
  type NovedadEstado,
  type Novedad,
  type Orden,
  type Planilla,
  type PlanillaItem,
} from "@/lib/api";
import { docNovedad, imprimirNovedad } from "@/lib/novedadDoc";
import { dlLabel, rnLabel } from "@/lib/utils";

const NIVEL_ESTADOS: NivelEstado[] = ["Sin Novedad", "Con Novedad", "Doc.Pendiente", "Reenvio", "Rechazado", "Parcial Con Novedad"];
// Estados que se muestran como tarjetas de estadística (sin Rechazado ni Parcial Con Novedad).
const STATS_ESTADOS: NivelEstado[] = ["Sin Novedad", "Con Novedad", "Doc.Pendiente", "Reenvio"];

const NOVEDADES_LIST = [
  "Averías", "Cliente Cerrado", "Cliente Sin Sistema",
  "Diferencia en Peso Faltante", "Diferencia en Peso Sobrante",
  "Dirección Errada", "Error de Vendedor", "Error en Despacho",
  "Error en Facturación", "Error en Método de Pago Acordado",
  "Falla de Temperatura en Cuarto Frio", "Fecha Corta",
  "Limitación en Capacidad de Almacenamiento", "Llegada tarde",
  "Mala Presentación", "Mercancía Incompleta", "No Pedido",
  "No Recogida", "Pedido Cancelado", "Pedido Duplicado",
  "Perdida de Vació", "Redespacho", "Sin Dinero", "Sobre Stock",
  "Trocado", "Decomiso", "Merma",
];

const RESPONSABILIDADES_LIST = [
  "Clientes", "Comercial", "Despacho Bovino", "Despacho Porcino",
  "Desposte Bovino", "Desposte Porcino", "Facturacion", "Inversiones",
  "Produccion", "Tripulacion", "Visceras Bovino", "Visceras Porcino",
];

const fmtKg = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fechaHoy() { return new Date().toISOString().slice(0, 10); }
function fechaAyer() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

type RowDraft = {
  estadoEntrega: NivelEstado;
  novedad: string;
  responsabilidad: string;
  descripcion: string;
};

// sentido: "contra" = llegó de menos (faltó); "favor" = llegó de más.
// noLlego se conserva opcional para leer novedades guardadas con el formato anterior.
type NoLlegoItem = { producto: string; despachado: number; sentido: "contra" | "favor"; diferencia: number; noLlego?: number };

function recibidoDe(row: { despachado: number; sentido: "contra" | "favor"; diferencia: number }): number {
  return row.sentido === "favor" ? row.despachado + row.diferencia : Math.max(0, row.despachado - row.diferencia);
}

const ESTADO_STYLE: Record<string, { border: string; text: string; bg: string; dot: string }> = {
  "Sin Novedad":         { border: "border-[#2f8f4e]", text: "text-[#2f8f4e]",  bg: "bg-[#f2f8ef]",  dot: "bg-[#2f8f4e]" },
  "Con Novedad":         { border: "border-[#b3261e]", text: "text-[#b3261e]",  bg: "bg-[#fbeceb]",  dot: "bg-[#b3261e]" },
  "Doc.Pendiente":       { border: "border-[#a86a12]", text: "text-[#a86a12]",  bg: "bg-[#fdf6e9]",  dot: "bg-[#a86a12]" },
  "Reenvio":             { border: "border-[#4a6fa5]", text: "text-[#4a6fa5]",  bg: "bg-[#eef2f8]",  dot: "bg-[#4a6fa5]" },
  "Rechazado":           { border: "border-[#b3261e]", text: "text-[#b3261e]",  bg: "bg-[#fbeceb]",  dot: "bg-[#b3261e]" },
  "Parcial Con Novedad": { border: "border-[#7c4a00]", text: "text-[#7c4a00]",  bg: "bg-[#fdf0e6]",  dot: "bg-[#7c4a00]" },
};

export default function NivelServicioPage() {
  const pathname = usePathname();
  const esTAT = pathname.includes("/tat");
  const titulo = esTAT ? "Nivel de servicio — TAT" : "Nivel de servicio — Distribución";
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buscar, setBuscar] = useState("");
  const [desde, setDesde] = useState(fechaAyer);
  const [hasta, setHasta] = useState(fechaHoy);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 20;

  // Borradores locales antes de persistir, keyed por "planillaId|numeroOrden"
  const [drafts, setDrafts] = useState<Map<string, RowDraft>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Modal reportar novedad (kg)
  const [reportando, setReportando] = useState<{ planillaId: string; item: PlanillaItem; planilla: Planilla } | null>(null);
  const [noLlegoData, setNoLlegoData] = useState<NoLlegoItem[]>([]);
  const [savingModal, setSavingModal] = useState(false);

  // Modal de resolución de novedad
  const [resolviendo, setResolviendo] = useState<{ key: string; planillaId: string; item: PlanillaItem; planilla: Planilla; novedad: Novedad | null } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function handleSyncDrivin() {
    setSyncing(true);
    try {
      const { actualizados } = await syncEstadoDrivin();
      if (actualizados > 0) await load(false);
    } catch { /* silencioso */ }
    finally { setSyncing(false); }
  }

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [plans, novs, ords] = await Promise.all([getPlanillas(), getNovedades(), getOrdenes()]);
      setPlanillas(plans);
      setOrdenes(ords);
      setNovedades(novs);

      // Poblar drafts con lo persistido (sin pisar lo que el usuario esté editando)
      setDrafts((prev) => {
        const next = new Map(prev);
        for (const n of novs) {
          if (!n.planillaId || !n.numeroOrden) continue;
          const key = `${n.planillaId}|${n.numeroOrden}`;
          if (!saving.has(key)) {
            next.set(key, {
              estadoEntrega: (n.estadoEntrega as NivelEstado) ?? "Sin Novedad",
              novedad: n.novedad ?? "",
              responsabilidad: n.responsabilidad ?? "",
              descripcion: n.descripcion ?? "",
            });
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      if (showLoading) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(true);
    pollRef.current = setInterval(() => load(false), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // Map novedades por planillaId|numeroOrden para lookup O(1)
  const novedadMap = useMemo(() => {
    const m = new Map<string, Novedad>();
    for (const n of novedades) {
      if (n.planillaId && n.numeroOrden) m.set(`${n.planillaId}|${n.numeroOrden}`, n);
    }
    return m;
  }, [novedades]);

  // Planillas filtradas por fecha y sin anuladas; separa TAT vs Distribución
  const planillasFiltradas = useMemo(() =>
    planillas.filter((p) => {
      if (p.anulada) return false;
      const f = p.fecha || new Date(p.createdAt).toISOString().slice(0, 10);
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    }),
    [planillas, desde, hasta]
  );

  // Expandir a filas por item, filtrar por tipo TAT/Distribución
  type ItemRow = { planillaId: string; planilla: Planilla; item: PlanillaItem };
  const allRows = useMemo<ItemRow[]>(() => {
    const rows: ItemRow[] = [];
    for (const p of planillasFiltradas) {
      for (const item of (p.items ?? [])) {
        const esTatItem = item.area === "TAT" || item.codigoArea?.startsWith("TAT") || false;
        if (esTAT && !esTatItem) continue;
        if (!esTAT && esTatItem) continue;
        rows.push({ planillaId: p.id, planilla: p, item });
      }
    }
    return rows;
  }, [planillasFiltradas, esTAT]);

  const rowsFiltrados = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return allRows;
    return allRows.filter(({ planilla, item }) =>
      [planilla.placa, planilla.conductor, planilla.auxiliarRuta, item.numeroOrden, item.cliente, item.destino, item.nombreDestino]
        .some((f) => f?.toLowerCase().includes(t))
    );
  }, [allRows, buscar]);

  // Resetear página al cambiar filtros
  useEffect(() => { setPagina(1); }, [buscar, desde, hasta]);

  const totalPaginas = Math.max(1, Math.ceil(rowsFiltrados.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas);
  const rowsPaginados = useMemo(
    () => rowsFiltrados.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA),
    [rowsFiltrados, pagActual]
  );

  const stats = useMemo(() => {
    const counts: Record<NivelEstado, number> = {
      "Sin Novedad": 0,
      "Con Novedad": 0,
      "Doc.Pendiente": 0,
      "Reenvio": 0,
      "Rechazado": 0,
      "Parcial Con Novedad": 0,
    };
    for (const r of allRows) {
      const d = drafts.get(`${r.planillaId}|${r.item.numeroOrden}`);
      counts[d?.estadoEntrega ?? "Sin Novedad"]++;
    }
    return counts;
  }, [allRows, drafts]);

  // Guardar un campo al API (create o update)
  async function saveField(planillaId: string, item: PlanillaItem, planilla: Planilla, patch: Partial<RowDraft>) {
    const key = `${planillaId}|${item.numeroOrden}`;
    setSaving((s) => new Set(s).add(key));
    try {
      const cur = drafts.get(key) ?? { estadoEntrega: "Sin Novedad" as NivelEstado, novedad: "", responsabilidad: "", descripcion: "" };
      const merged = { ...cur, ...patch };
      const payload = {
        estadoEntrega: merged.estadoEntrega,
        novedad: merged.novedad || null,
        responsabilidad: merged.responsabilidad || null,
        descripcion: merged.descripcion || "",
        planillaId,
        numeroOrden: item.numeroOrden,
        cliente: item.cliente,
        placa: planilla.placa,
        conductor: planilla.conductor,
        auxiliarRuta: planilla.auxiliarRuta,
        fecha: planilla.fecha || new Date(planilla.createdAt).toISOString().slice(0, 10),
      };
      const existing = novedadMap.get(key);
      if (existing) {
        await editarNovedad(existing.id, payload);
      } else {
        const n = await crearNovedad({ ...payload, tipo: merged.novedad || "" });
        setNovedades((prev) => [...prev, n]);
      }
      // Actualización silenciosa
      load(false);
    } catch { /* silencioso — se reintenta en el siguiente poll */ }
    finally { setSaving((s) => { const ns = new Set(s); ns.delete(key); return ns; }); }
  }

  function updateDraft(planillaId: string, item: PlanillaItem, planilla: Planilla, patch: Partial<RowDraft>, persist = true) {
    const key = `${planillaId}|${item.numeroOrden}`;
    setDrafts((prev) => {
      const cur = prev.get(key) ?? { estadoEntrega: "Sin Novedad" as NivelEstado, novedad: "", responsabilidad: "", descripcion: "" };
      return new Map(prev).set(key, { ...cur, ...patch });
    });
    if (persist) saveField(planillaId, item, planilla, patch);
  }

  function openReportarModal(planillaId: string, item: PlanillaItem, planilla: Planilla) {
    // Empareja por remisión + placa; si no hay coincidencia, por remisión sola (para tener el producto real).
    let prods = ordenes.filter(
      (o) => o.numeroOrden === item.numeroOrden &&
             o.asignadoVehiculo?.toUpperCase() === planilla.placa.toUpperCase()
    );
    if (prods.length === 0) {
      prods = ordenes.filter((o) => o.numeroOrden === item.numeroOrden);
    }
    const key = `${planillaId}|${item.numeroOrden}`;
    let saved: NoLlegoItem[] = [];
    try { saved = JSON.parse(novedadMap.get(key)?.noLlego ?? "[]"); } catch { saved = []; }
    // Convierte una novedad guardada al modelo diferencia (compat con formato antiguo `noLlego`).
    const toDiff = (s?: NoLlegoItem): { sentido: "contra" | "favor"; diferencia: number } => {
      if (!s) return { sentido: "contra", diferencia: 0 };
      if (s.sentido) return { sentido: s.sentido, diferencia: s.diferencia ?? 0 };
      return { sentido: "contra", diferencia: s.noLlego ?? 0 };
    };

    setNoLlegoData(
      prods.length > 0
        ? prods.map((o) => {
            const d = toDiff(saved.find((s) => s.producto === o.producto));
            return { producto: o.producto, despachado: o.cantidadKg, sentido: d.sentido, diferencia: d.diferencia };
          })
        : [(() => {
            const d = toDiff(saved[0]);
            return { producto: item.numeroOrden || "Producto", despachado: item.kg, sentido: d.sentido, diferencia: d.diferencia };
          })()]
    );
    setReportando({ planillaId, item, planilla });
  }

  async function saveNoLlego() {
    if (!reportando) return;
    setSavingModal(true);
    const key = `${reportando.planillaId}|${reportando.item.numeroOrden}`;
    const existing = novedadMap.get(key);
    const noLlegoJson = JSON.stringify(noLlegoData);
    try {
      if (existing) {
        await editarNovedad(existing.id, { noLlego: noLlegoJson });
      } else {
        await crearNovedad({
          tipo: "",
          planillaId: reportando.planillaId,
          numeroOrden: reportando.item.numeroOrden,
          cliente: reportando.item.cliente,
          placa: reportando.planilla.placa,
          conductor: reportando.planilla.conductor,
          auxiliarRuta: reportando.planilla.auxiliarRuta,
          fecha: reportando.planilla.fecha || new Date(reportando.planilla.createdAt).toISOString().slice(0, 10),
          noLlego: noLlegoJson,
        });
      }
      await load(false);
      setReportando(null);
    } catch {
      setError("Error al guardar el reporte de novedad");
    } finally {
      setSavingModal(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">{titulo}</h1>
          <p className="text-sm text-[#5f7a68]">Estado de entrega por remisión · actualiza cada 30 s.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => load(false)} title="Actualizar ahora" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          </button>
          <button onClick={handleSyncDrivin} disabled={syncing} title="Sincronizar estados desde Drivin" className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50">
            {syncing
              ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z"/></svg>
              : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>
            }
            {syncing ? "Sincronizando…" : "Sync Drivin"}
          </button>
          <label className="flex items-center gap-1.5 text-sm text-[#7a8794]">
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-[#7a8794]">
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
          </label>
        </div>
      </header>

      {error && <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      {/* Stats */}
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">Total</p>
              <p className="mt-1 text-2xl font-bold text-[#14352a]">{allRows.length}</p>
            </div>
            {STATS_ESTADOS.map((e) => {
              const s = ESTADO_STYLE[e];
              return (
                <div key={e} className={`rounded-xl border p-4 shadow-sm ${s.bg} ${s.border}`}>
                  <p className={`text-xs font-medium uppercase tracking-wide ${s.text}`}>{e}</p>
                  <p className={`mt-1 text-2xl font-bold ${s.text}`}>{stats[e]}</p>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Tabla */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar placa, conductor, orden, cliente…" className="w-full sm:w-72" />
          <span className="text-xs text-[#7a8794]">{rowsFiltrados.length} remisiones</span>
        </div>

        {loading ? (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold" style={{ minWidth: "160px" }}>Vehículo</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Documento</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente / Destino</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Kilos</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Estado</th>
                  <th className="px-2 py-3"></th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Novedades</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Responsabilidades</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Detalles</th>
                </tr>
              </thead>
              <SkeletonTable rows={10} cols={9} />
            </table>
          </div>
        ) : rowsFiltrados.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">No hay remisiones para el período seleccionado.</p>
        ) : (
          <div className="nice-scroll overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold" style={{ minWidth: "160px" }}>Vehículo</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Documento</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente / Destino</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Kilos</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Estado</th>
                  <th className="px-2 py-3"></th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Novedades</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Responsabilidades</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {rowsPaginados.map(({ planillaId, planilla, item }) => {
                  const key = `${planillaId}|${item.numeroOrden}`;
                  const draft = drafts.get(key) ?? { estadoEntrega: "Sin Novedad" as NivelEstado, novedad: "", responsabilidad: "", descripcion: "" };
                  const isSaving = saving.has(key);
                  // Si la novedad ya está resuelta/cerrada, se muestra en ámbar (no rojo) para distinguir pendientes.
                  const novEstado = novedadMap.get(key)?.estado;
                  const resuelta = novEstado === "Resuelto" || novEstado === "Cerrada";
                  const s = resuelta && draft.estadoEntrega !== "Sin Novedad"
                    ? { border: "border-[#a86a12]", text: "text-[#a86a12]", bg: "bg-[#fdf6e9]", dot: "bg-[#a86a12]" }
                    : ESTADO_STYLE[draft.estadoEntrega];

                  return (
                    <tr key={key} className="hover:bg-[#f9fbf7]">
                      {/* Placa + conductor + auxiliar */}
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-bold tracking-wider text-[#14352a] ring-1 ring-yellow-400">{planilla.placa}</span>
                        <div className="mt-0.5 text-[11px] text-[#45505e]">{planilla.conductor || "—"}</div>
                        {planilla.auxiliarRuta && <div className="text-[10px] text-[#7a8794]">{planilla.auxiliarRuta}</div>}
                      </td>
                      {/* Documento + consecutivo planilla */}
                      <td className="px-4 py-2.5">
                        {novedadMap.get(key) && (
                          <div className="text-[10px] font-bold text-[#4a6fa5]">{rnLabel(novedadMap.get(key)!.consecutivo)}</div>
                        )}
                        <div className="font-mono text-xs font-semibold text-[#14352a]">{item.numeroOrden}</div>
                        <div className="text-[10px] text-[#7a8794]">{dlLabel(planilla.consecutivo)}</div>
                      </td>
                      {/* Cliente / Destino */}
                      <td className="px-4 py-2.5">
                        <div className="text-xs font-medium text-[#45505e]">{item.nombreDestino || item.destino}</div>
                        <div className="text-[11px] text-[#7a8794]">{item.cliente}</div>
                      </td>
                      {/* Kilos */}
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-medium text-[#14352a]">{fmtKg(item.kg)}</td>
                      {/* Estado dropdown estilizado */}
                      <td className="px-4 py-2.5">
                        <div className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${s.border} ${s.bg}`} title="El estado se sincroniza desde Drivin">
                          {isSaving && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#a86a12] animate-pulse ring-2 ring-white" />
                          )}
                          <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                          <span className={`text-xs font-semibold ${s.text}`}>{draft.estadoEntrega}</span>
                        </div>
                      </td>
                      {/* Botón reportar kg */}
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openReportarModal(planillaId, item, planilla)}
                            title="Reportar kg no recibidos"
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                              draft.estadoEntrega === "Con Novedad"
                                ? "border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e] hover:bg-[#f7dedb]"
                                : "border-[#dfe4e0] bg-white text-[#7a8794] hover:bg-[#f4f6f3]"
                            }`}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                          </button>
                          {/* PDF — disponible en todas las filas (usa la novedad guardada o los datos actuales) */}
                          <button
                            onClick={() => {
                              const guardada = novedadMap.get(key);
                              const docData: Novedad = guardada ?? {
                                id: "",
                                consecutivo: 0,
                                fecha: planilla.fecha || new Date(planilla.createdAt).toISOString().slice(0, 10),
                                tipo: "",
                                prioridad: "Media",
                                estado: "Pendiente",
                                estadoEntrega: draft.estadoEntrega,
                                novedad: draft.novedad || null,
                                responsabilidad: draft.responsabilidad || null,
                                noLlego: null,
                                planillaId,
                                placa: planilla.placa,
                                conductor: planilla.conductor,
                                auxiliarRuta: planilla.auxiliarRuta,
                                cliente: item.cliente,
                                numeroOrden: item.numeroOrden,
                                descripcion: draft.descripcion || "",
                                resolucion: null,
                                resueltaAt: null,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                              };
                              imprimirNovedad(docNovedad(docData));
                            }}
                            title="Generar PDF del documento"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"
                          >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                              </svg>
                            </button>
                        </div>
                      </td>
                      {/* Novedades */}
                      <td className="px-4 py-2.5">
                        <select
                          value={draft.novedad}
                          onChange={(e) => {
                            updateDraft(planillaId, item, planilla, { novedad: e.target.value });
                          }}
                          className="w-52 rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-1 focus:ring-[#2f8f4e]/20"
                        >
                          <option value="">—</option>
                          {NOVEDADES_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      {/* Responsabilidades */}
                      <td className="px-4 py-2.5">
                        <select
                          value={draft.responsabilidad}
                          onChange={(e) => {
                            updateDraft(planillaId, item, planilla, { responsabilidad: e.target.value });
                          }}
                          className="w-44 rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-1 focus:ring-[#2f8f4e]/20"
                        >
                          <option value="">—</option>
                          {RESPONSABILIDADES_LIST.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      {/* Detalles */}
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={draft.descripcion}
                          onChange={(e) => updateDraft(planillaId, item, planilla, { descripcion: e.target.value }, false)}
                          onBlur={() => saveField(planillaId, item, planilla, { descripcion: draft.descripcion })}
                          placeholder="Escribe detalles..."
                          className="w-52 rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#14352a] placeholder:text-[#b0b9b3] outline-none transition focus:border-[#2f8f4e] focus:ring-1 focus:ring-[#2f8f4e]/20"
                        />
                      </td>
                      {/* Resolución */}
                      <td className="px-4 py-2.5">
                        {(() => {
                          const nov = novedadMap.get(key) ?? null;
                          const est = nov?.estado ?? "Pendiente";
                          const estStyle =
                            est === "Resuelto" ? "bg-[#e8f3e2] text-[#2f8f4e]" :
                            est === "Cerrada" ? "bg-[#eceef0] text-[#6b7683]" :
                            est === "En tramitación" ? "bg-[#fdf6e9] text-[#a86a12]" :
                            "bg-[#f0f1f2] text-[#7a8794]";
                          return (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setResolviendo({ key, planillaId, item, planilla, novedad: nov })}
                                className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3]"
                              >
                                Resolución
                              </button>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${estStyle}`}>{est}</span>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && rowsFiltrados.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3">
            <p className="text-xs text-[#7a8794]">
              Mostrando {((pagActual - 1) * POR_PAGINA) + 1}–{Math.min(pagActual * POR_PAGINA, rowsFiltrados.length)} de {rowsFiltrados.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPagina(1)} disabled={pagActual === 1} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-40">«</button>
              <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagActual === 1} className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-40">‹</button>
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
                    <button key={p} onClick={() => setPagina(p as number)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        pagActual === p ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"
                      }`}
                    >{p}</button>
                  )
                )}
              <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagActual === totalPaginas} className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1.5 text-xs text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-40">›</button>
              <button onClick={() => setPagina(totalPaginas)} disabled={pagActual === totalPaginas} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-xs text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Resolución de novedad */}
      {resolviendo && (
        <ResolucionModal
          data={resolviendo}
          onClose={() => setResolviendo(null)}
          onSaved={async () => { setResolviendo(null); await load(false); }}
        />
      )}

      {/* Modal: Reportar Novedad (kg no recibidos) */}
      {reportando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">
                Reportar Novedad — <span className="font-mono text-[#2f8f4e]">{reportando.item.numeroOrden}</span>
              </h3>
              <p className="mt-0.5 text-sm text-[#5f7a68]">
                Ajusta lo despachado si aplica e indica la{" "}
                <strong className="text-[#14352a]">diferencia</strong> (a favor o en contra) que el cliente reporta por cada producto.
              </p>
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#eceef0]">
                    <th className="pb-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Producto</th>
                    <th className="pb-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Despachado (kg)</th>
                    <th className="pb-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#7a8794]">Diferencia</th>
                    <th className="pb-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#2f8f4e]">Recibido (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {noLlegoData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-4 font-medium text-[#14352a]">{row.producto}</td>
                      <td className="py-3 pr-2 text-right">
                        <input
                          type="number" step="any" value={row.despachado}
                          onChange={(e) => setNoLlegoData((p) => p.map((r, i) => i === idx ? { ...r, despachado: Number(e.target.value) || 0 } : r))}
                          className="w-24 rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-right text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
                        />
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={row.sentido}
                            onChange={(e) => setNoLlegoData((p) => p.map((r, i) => i === idx ? { ...r, sentido: e.target.value as "contra" | "favor" } : r))}
                            className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
                          >
                            <option value="contra">En contra</option>
                            <option value="favor">A favor</option>
                          </select>
                          <input
                            type="number" step="any" min="0" value={row.diferencia}
                            onChange={(e) => setNoLlegoData((p) => p.map((r, i) => i === idx ? { ...r, diferencia: Number(e.target.value) || 0 } : r))}
                            className={`w-20 rounded-lg border bg-white px-2 py-1.5 text-right text-sm text-[#14352a] outline-none ${row.sentido === "favor" ? "border-[#cfe4d6] focus:border-[#2f8f4e] focus:ring-1 focus:ring-[#2f8f4e]/20" : "border-[#dfe4e0] focus:border-[#b3261e] focus:ring-1 focus:ring-[#b3261e]/20"}`}
                          />
                        </div>
                      </td>
                      <td className="py-3 text-right tabular-nums text-sm font-bold text-[#2f8f4e]">
                        {fmtKg(recibidoDe(row))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => setReportando(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={saveNoLlego} disabled={savingModal} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#277a42] disabled:opacity-60">
                {savingModal ? "Guardando…" : "Guardar Novedad"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolucionModal({
  data,
  onClose,
  onSaved,
}: {
  data: { key: string; planillaId: string; item: PlanillaItem; planilla: Planilla; novedad: Novedad | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { item, planilla, novedad } = data;
  const [resolucion, setResolucion] = useState(novedad?.resolucion ?? "");
  const [estado, setEstado] = useState<NovedadEstado>(novedad?.estado ?? "Pendiente");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ESTADOS: NovedadEstado[] = ["Pendiente", "En tramitación", "Resuelto", "Cerrada"];

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      if (novedad) {
        await editarNovedad(novedad.id, { resolucion: resolucion.trim() || null, estado });
      } else {
        await crearNovedad({
          planillaId: data.planillaId,
          numeroOrden: item.numeroOrden,
          cliente: item.cliente,
          placa: planilla.placa,
          conductor: planilla.conductor,
          auxiliarRuta: planilla.auxiliarRuta,
          fecha: planilla.fecha || new Date(planilla.createdAt).toISOString().slice(0, 10),
          estadoEntrega: "Con Novedad",
          resolucion: resolucion.trim() || null,
          estado,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#14352a]">Resolución de novedad</h3>
            <p className="text-xs text-[#7a8794]">
              {novedad ? rnLabel(novedad.consecutivo) : "Nueva"} · Doc {item.numeroOrden} · {planilla.placa}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-3 py-2 text-sm text-[#b3261e]">{error}</div>}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[#7a8794]">Resolución</span>
          <textarea value={resolucion} onChange={(e) => setResolucion(e.target.value)} rows={4} placeholder="Describe cómo se resolvió la novedad…" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
        </label>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs font-medium text-[#7a8794]">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as NovedadEstado)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
