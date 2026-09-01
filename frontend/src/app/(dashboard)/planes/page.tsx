"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  agregarAPlan,
  crearPlan,
  getFlotas,
  getOrdenes,
  getPlanes,
  getSchemas,
  getVehiculosExternos,
  type Orden,
  type Plan,
  type PlanMeta,
  type VehiculoExterno,
} from "@/lib/api";
import { tc } from "@/lib/utils";
import { SkeletonVehicleCard } from "@/components/Loading";
import { getPlanNombres } from "@/app/(dashboard)/configuracion/plan-nombres/page";

const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

const STATUS_LABEL: Record<string, string> = { Started: "En curso", Finished: "Finalizado", Pending: "Pendiente" };
const STATUS_COLORS: Record<string, string> = {
  Started: "bg-[#e6effb] text-[#1a5fb4]",
  Finished: "bg-[#e8f3e2] text-[#2f8f4e]",
  Pending: "bg-[#fef9e7] text-[#b5941e]",
};

function hoy() { return new Date().toISOString().slice(0, 10); }

type VehOrdenes = {
  vehiculo: VehiculoExterno;
  ordenes: Orden[];
  totalKg: number;
  enviadas: number;
  pendientes: number;
};

export default function DiagramaPage() {
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [buscar, setBuscar] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [showPlanes, setShowPlanes] = useState(false);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [planesDate, setPlanesDate] = useState(hoy);
  const [loadingPlanes, setLoadingPlanes] = useState(false);

  const [planModal, setPlanModal] = useState(false);
  const [nombresPlan, setNombresPlan] = useState<string[]>([]);
  const [planBase, setPlanBase] = useState("Distribucion TAT");
  const [planFecha, setPlanFecha] = useState(hoy);
  const [planSchema, setPlanSchema] = useState("Distribucion Rutas Agropecuaria");
  const [planFlota, setPlanFlota] = useState("");
  const [planModo, setPlanModo] = useState<"nuevo" | "existente">("nuevo");
  const [planesExistentes, setPlanesExistentes] = useState<Plan[]>([]);
  const [planTokenSel, setPlanTokenSel] = useState("");
  const [schemas, setSchemas] = useState<string[]>(["Distribucion Rutas Agropecuaria", "Distribucion Rutas TAT"]);
  const [flotas, setFlotas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [vehs, ords] = await Promise.all([getVehiculosExternos(), getOrdenes()]);
      setVehiculos(vehs);
      setOrdenes(ords);
      setChecked((prev) => {
        if (prev.size > 0) return prev;
        return new Set(); // sin marcar por defecto
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    pollRef.current = setInterval(() => load(false), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const grupos = useMemo<VehOrdenes[]>(() => {
    return vehiculos
      .filter((v) => v.estado === "Activo")
      .map((v) => {
        const ords = ordenes.filter(
          (o) => o.asignadoVehiculo?.toUpperCase() === v.placa.toUpperCase() &&
                 o.estado !== "Entregado" && o.estado !== "Rechazado"
        );
        return {
          vehiculo: v,
          ordenes: ords,
          totalKg: ords.reduce((s, o) => s + o.cantidadKg, 0),
          enviadas: ords.filter((o) => o.estado === "Enviado").length,
          pendientes: ords.filter((o) => o.estado === "Pendiente").length,
        };
      })
      .filter((g) => g.ordenes.length > 0)
      .sort((a, b) => a.vehiculo.placa.localeCompare(b.vehiculo.placa));
  }, [vehiculos, ordenes]);

  const filtrados = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return grupos;
    return grupos.filter((g) =>
      [g.vehiculo.placa, g.vehiculo.conductor, g.vehiculo.flotas, g.vehiculo.empleadores]
        .some((f) => f?.toLowerCase().includes(t))
    );
  }, [grupos, buscar]);

  const checkedConPendientes = useMemo(
    () => grupos.filter((g) => checked.has(g.vehiculo.placa.toUpperCase()) && g.pendientes > 0).map((g) => g.vehiculo.placa),
    [grupos, checked]
  );

  // Flotas distintas de los vehículos seleccionados (para autoseleccionar o dejar escoger).
  const flotasSeleccionadas = useMemo(() => {
    const set = new Set<string>();
    for (const g of grupos) {
      if (!checked.has(g.vehiculo.placa.toUpperCase()) || g.pendientes === 0) continue;
      for (const f of String(g.vehiculo.flotas ?? "").split(/[,;/]/)) {
        const t = f.trim();
        if (t) set.add(t);
      }
    }
    return [...set];
  }, [grupos, checked]);

  function toggleCheck(placa: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(placa.toUpperCase())) next.delete(placa.toUpperCase());
      else next.add(placa.toUpperCase());
      return next;
    });
  }

  function selectAll() { setChecked(new Set(grupos.map((g) => g.vehiculo.placa.toUpperCase()))); }
  function deselectAll() { setChecked(new Set()); }

  async function abrirPlanes() {
    setShowPlanes(true);
    setLoadingPlanes(true);
    try { setPlanes(await getPlanes(planesDate)); }
    catch { /* */ }
    finally { setLoadingPlanes(false); }
  }

  function abrirCrearPlan() {
    const nombres = getPlanNombres().map((p) => p.nombre);
    setNombresPlan(nombres);
    setPlanFecha(hoy());
    setPlanBase(nombres[0] ?? "Distribucion TAT");
    setPlanModo("nuevo");
    setPlanTokenSel("");
    setPlanesExistentes([]);
    setPlanMeta(null);
    // Si los vehículos seleccionados traen una sola flota, se fija automáticamente.
    setPlanFlota(flotasSeleccionadas.length === 1 ? flotasSeleccionadas[0] : "");
    setPlanModal(true);
    const DEFAULTS = ["Distribucion Rutas Agropecuaria", "Distribucion Rutas TAT"];
    getSchemas().then((s) => setSchemas([...new Set([...DEFAULTS, ...s])].sort())).catch(() => {});
    getFlotas().then((f) => setFlotas(f)).catch(() => {});
    getPlanes(hoy()).then((ps) => {
      const activos = ps.filter((p) => p.status !== "Finished");
      setPlanesExistentes(activos);
      if (activos.length > 0) setPlanTokenSel(activos[0].token);
    }).catch(() => {});
  }

  async function handleEnviarDrivin() {
    if (planModo === "nuevo" && !planFecha) return;
    if (planModo === "existente" && !planTokenSel) return;
    setEnviando(true);
    setError(null);
    setMessage(null);
    try {
      let meta: PlanMeta;
      if (planModo === "existente") {
        const result = await agregarAPlan(planTokenSel);
        meta = result._meta as PlanMeta;
        const nuevas = Number(meta.nuevas ?? 0);
        const dups = Number(meta.duplicadas ?? 0);
        setMessage(nuevas === 0 ? `Sin órdenes nuevas: las ${dups} ya existían.` : `${nuevas} órdenes agregadas al plan.`);
      } else {
        const result = await crearPlan({
          descripcion: `${planBase} ${planFecha.split("-").reverse().join("/")}`,
          fecha: planFecha,
          schemaName: planSchema,
          fleetName: planFlota || undefined,
          placas: checkedConPendientes.length > 0 ? checkedConPendientes : undefined,
        });
        meta = result._meta as PlanMeta;
        setMessage(`Plan creado en Drivin: ${meta.vehiculos} vehículos · ${meta.ordenes} órdenes.`);
      }
      setPlanMeta(meta);
      setPlanModal(false);
      setChecked(new Set());
      await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al enviar a Drivin");
    } finally {
      setEnviando(false);
    }
  }

  const todosChecked = grupos.length > 0 && grupos.every((g) => checked.has(g.vehiculo.placa.toUpperCase()));
  const algunoChecked = grupos.some((g) => checked.has(g.vehiculo.placa.toUpperCase()));
  // supress unused warning
  void planMeta;

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 sm:p-8">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Diagrama de asignaciones</h1>
          <p className="text-sm text-[#5f7a68]">
            {grupos.length} vehículo{grupos.length !== 1 ? "s" : ""} con órdenes · {grupos.reduce((s, g) => s + g.ordenes.length, 0)} órdenes asignadas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => load(false)} title="Actualizar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          </button>
          <button onClick={abrirPlanes} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            Ver planes Drivin
          </button>
          <button onClick={abrirCrearPlan} disabled={checkedConPendientes.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-40">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>
            Enviar a Drivin {checkedConPendientes.length > 0 && `(${checkedConPendientes.length})`}
          </button>
        </div>
      </header>

      {message && <div className="mb-3 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">{message}</div>}
      {error && <div className="mb-3 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a6b0a9]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar placa, conductor…"
            className="w-56 rounded-lg border border-[#dfe4e0] bg-white py-2 pl-9 pr-3 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#45505e]">
          <input type="checkbox" checked={todosChecked} onChange={todosChecked ? deselectAll : selectAll}
            className="h-4 w-4 rounded border-[#dfe4e0] accent-[#2f8f4e]" />
          {todosChecked ? "Desmarcar todos" : "Marcar todos"}
        </label>
        {algunoChecked && <span className="text-xs text-[#7a8794]">{checked.size} seleccionados para Drivin</span>}
      </div>

      {loading ? (
        <div className="nice-scroll min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonVehicleCard key={i} />)}
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-1 items-center justify-center"><p className="text-sm text-[#5f7a68]">No hay vehículos con órdenes asignadas.</p></div>
      ) : (
        <div className="nice-scroll min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map(({ vehiculo: v, ordenes: ords, totalKg, enviadas }) => {
              const pct = v.capacidad ? Math.min(100, (totalKg / Number(v.capacidad)) * 100) : 0;
              const isChecked = checked.has(v.placa.toUpperCase());
              return (
                <div key={v.id} className={`flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md ${isChecked ? "border-[#2f8f4e] ring-1 ring-[#2f8f4e]/30" : "border-[#e1e9dd]"}`}>
                  <div className="flex items-center gap-3 bg-[#14352a] px-4 py-3">
                    <button onClick={() => toggleCheck(v.placa)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${isChecked ? "border-[#2f8f4e] bg-[#2f8f4e] text-white" : "border-white/40 bg-transparent"}`}
                      title={isChecked ? "Desmarcar para Drivin" : "Marcar para Drivin"}>
                      {isChecked && <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <div className="flex flex-col items-center justify-center rounded-lg border-4 border-yellow-400 bg-yellow-300 px-2.5 py-1 shadow-inner">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#14352a]">Colombia</span>
                      <span className="text-base font-extrabold tracking-widest text-[#14352a] leading-none">{v.placa}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{v.conductor || "Sin conductor"}</p>
                      <p className="text-xs text-[#a8c9b0]">{v.flotas || v.empleadores || "—"}</p>
                      <p className="text-xs text-[#a8c9b0]">Cap. {v.capacidad ?? "—"} kg</p>
                      <p className="text-xs text-[#a8c9b0]">{ords.length} órdenes</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${enviadas === ords.length ? "bg-[#2f8f4e] text-white" : "bg-[#e6effb] text-[#1a5fb4]"}`}>
                      {enviadas}/{ords.length} env.
                    </span>
                  </div>

                  <div className="bg-[#f7faf5] px-4 py-2">
                    <div className="mb-1 flex justify-between text-xs text-[#5f7a68]">
                      <span>{fmtKg(totalKg)} kg cargados</span>
                      <span className={pct > 95 ? "font-semibold text-[#b3261e]" : ""}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e1e9dd]">
                      <div className={`h-1.5 rounded-full transition-all ${pct > 95 ? "bg-[#b3261e]" : pct > 70 ? "bg-[#b5941e]" : "bg-[#2f8f4e]"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="nice-scroll max-h-48 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#f7faf5] text-[#7a8794]">
                        <tr>
                          <th className="px-4 py-1.5 font-semibold">No. Orden</th>
                          <th className="px-4 py-1.5 font-semibold">Código</th>
                          <th className="px-4 py-1.5 text-right font-semibold">kg</th>
                          <th className="px-4 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f2ee]">
                        {ords.map((o) => (
                          <tr key={o.id} className="hover:bg-[#f9fbf7]">
                            <td className="px-4 py-1.5 font-medium text-[#14352a]">{o.numeroOrden}</td>
                            <td className="max-w-[140px] truncate px-4 py-1.5 text-[#45505e]">{tc(o.cliente)} — {tc(o.destino)}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-[#14352a]">{o.cantidadKg.toFixed(0)}</td>
                            <td className="px-4 py-1.5">
                              {o.estado === "Enviado"
                                ? <span className="text-[#2f8f4e]">✓</span>
                                : <span className="inline-flex h-2 w-2 rounded-full bg-[#b5941e]" title="Pendiente de envío" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-4 text-xs text-[#7a8794]">
        <span className="flex items-center gap-1.5"><span className="inline-flex h-2 w-2 rounded-full bg-[#2f8f4e]" /> Enviada a Drivin</span>
        <span className="flex items-center gap-1.5"><span className="inline-flex h-2 w-2 rounded-full bg-[#b5941e]" /> Pendiente de envío</span>
        <span className="flex items-center gap-1.5"><span className="block h-2 w-6 rounded-full bg-[#b3261e]" /> Capacidad &gt;95%</span>
      </div>

      {/* Modal: planes Drivin */}
      {showPlanes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPlanes(false)}>
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">Planes en Drivin</h3>
              <div className="flex items-center gap-3">
                <input type="date" value={planesDate} onChange={async (e) => {
                  setPlanesDate(e.target.value);
                  setLoadingPlanes(true);
                  try { setPlanes(await getPlanes(e.target.value)); } catch { /* */ } finally { setLoadingPlanes(false); }
                }} className="rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
                <button onClick={() => setShowPlanes(false)} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-auto p-6">
              {loadingPlanes ? (
                <p className="text-center text-sm text-[#5f7a68]">Cargando…</p>
              ) : planes.length === 0 ? (
                <p className="text-center text-sm text-[#5f7a68]">No hay planes para el {planesDate}.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {planes.map((p) => (
                    <div key={p.token} className="rounded-2xl border border-[#e1e9dd] bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#14352a]">{p.description}</h4>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? "bg-[#f0f2ee] text-[#45505e]"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                      </div>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt className="uppercase text-[#7a8794]">Fecha</dt><dd className="text-[#14352a]">{p.deploy_date}</dd></div>
                        <div><dt className="uppercase text-[#7a8794]">Schema</dt><dd className="text-[#45505e]">{p.schema_name}</dd></div>
                        <div className="col-span-2"><dt className="uppercase text-[#7a8794]">Token</dt><dd className="font-mono text-[#a6b0a9]">{p.token}</dd></div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: crear plan Drivin */}
      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPlanModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">Enviar a Drivin</h3>
                <p className="text-xs text-[#7a8794]">{checkedConPendientes.length} vehículo{checkedConPendientes.length !== 1 ? "s" : ""} seleccionado{checkedConPendientes.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setPlanModal(false)} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex gap-2">
                {(["nuevo", "existente"] as const).map((m) => (
                  <button key={m} onClick={() => setPlanModo(m)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${planModo === m ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] text-[#45505e] hover:bg-[#f4f6f3]"}`}>
                    {m === "nuevo" ? "Crear nuevo plan" : "Agregar a existente"}
                  </button>
                ))}
              </div>
              {planModo === "nuevo" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[#7a8794]">Nombre base</span>
                    <select value={planBase} onChange={(e) => setPlanBase(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
                      {nombresPlan.length === 0 && <option value={planBase}>{planBase}</option>}
                      {nombresPlan.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[#7a8794]">Fecha</span>
                    <input type="date" value={planFecha} onChange={(e) => setPlanFecha(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[#7a8794]">Schema</span>
                    <select value={planSchema} onChange={(e) => setPlanSchema(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
                      {schemas.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  {flotasSeleccionadas.length === 1 ? (
                    // Una sola flota en los vehículos seleccionados: se fija y no se puede cambiar.
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[#7a8794]">Flota</span>
                      <input
                        value={flotasSeleccionadas[0]}
                        readOnly
                        className="cursor-not-allowed rounded-lg border border-[#dfe4e0] bg-[#f7faf5] px-3 py-2.5 text-sm text-[#14352a] outline-none"
                      />
                    </label>
                  ) : flotasSeleccionadas.length >= 2 ? (
                    // Varias flotas: dejar escoger entre las involucradas.
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[#7a8794]">Flota</span>
                      <select value={planFlota} onChange={(e) => setPlanFlota(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
                        <option value="">Todas las flotas</option>
                        {flotasSeleccionadas.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                  ) : flotas.length > 0 ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[#7a8794]">Flota (opcional)</span>
                      <select value={planFlota} onChange={(e) => setPlanFlota(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
                        <option value="">Todas las flotas</option>
                        {flotas.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7a8794]">Plan existente</span>
                  {planesExistentes.length === 0 ? (
                    <p className="text-sm text-[#7a8794]">No hay planes activos hoy.</p>
                  ) : (
                    <select value={planTokenSel} onChange={(e) => setPlanTokenSel(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]">
                      {planesExistentes.map((p) => <option key={p.token} value={p.token}>{p.description}</option>)}
                    </select>
                  )}
                </label>
              )}
              {checkedConPendientes.length > 0 && (
                <div className="rounded-lg border border-[#dfe4e0] bg-[#f7faf5] px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-[#7a8794]">Vehículos a enviar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {checkedConPendientes.map((p) => (
                      <span key={p} className="rounded bg-yellow-300 px-2 py-0.5 text-xs font-bold text-[#14352a] ring-1 ring-yellow-400">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => setPlanModal(false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={handleEnviarDrivin} disabled={enviando || (planModo === "existente" && !planTokenSel)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
                {enviando && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z"/></svg>}
                {enviando ? "Enviando…" : "Confirmar y enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
