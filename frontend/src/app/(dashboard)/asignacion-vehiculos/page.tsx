"use client";

import { useCallback, useEffect, useState } from "react";
import { tc, btn } from "@/lib/utils";
import {
  ApiError,
  agregarAPlan,
  asignarOrdenes,
  crearPlan,
  getFlotas,
  getOrdenes,
  getPlanes,
  getSchemas,
  getVehiculosExternos,
  reenviarOrdenes,
  type Orden,
  type Plan,
  type PlanMeta,
  type VehiculoExterno,
} from "@/lib/api";
import SearchInput from "@/components/SearchInput";

type OrdenGrupo = {
  key: string;
  numeroOrden: string;
  fecha: string;
  cliente: string;
  destino: string;
  distribucion: string;
  tatOrigen: string | null;
  asignado: string | null;
  enviado: boolean;
  ids: string[];
  totalKg: number;
  items: number;
};

function agrupar(ordenes: Orden[]): OrdenGrupo[] {
  const map = new Map<string, OrdenGrupo>();
  for (const o of ordenes) {
    const key = `${o.numeroOrden}||${o.cliente}||${o.destino}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        numeroOrden: o.numeroOrden,
        fecha: o.fecha,
        cliente: o.cliente,
        destino: o.destino,
        distribucion: o.distribucion,
        tatOrigen: o.tatOrigen,
        asignado: o.asignadoVehiculo,
        enviado: false,
        ids: [],
        totalKg: 0,
        items: 0,
      };
      map.set(key, g);
    }
    g.ids.push(o.id);
    g.totalKg += o.cantidadKg;
    g.items += 1;
    if (o.asignadoVehiculo) g.asignado = o.asignadoVehiculo;
    if (o.estado === "Enviado") g.enviado = true;
  }
  return Array.from(map.values());
}

export default function AsignacionVehiculosPage() {
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vehiculoSel, setVehiculoSel] = useState<VehiculoExterno | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [buscarOrd, setBuscarOrd] = useState("");
  const [verAsignadas, setVerAsignadas] = useState(false);
  // Filtro por tipo de distribución en órdenes pendientes.
  const [filtroDist, setFiltroDist] = useState<"" | "TAT" | "GS">("");
  const [verDiagrama, setVerDiagrama] = useState(false);
  const [buscarAsig, setBuscarAsig] = useState("");
  const [seleccionAsig, setSeleccionAsig] = useState<Set<string>>(new Set());
  const [verRechazados, setVerRechazados] = useState(false);
  const [buscarRechazados, setBuscarRechazados] = useState("");
  const [seleccionRech, setSeleccionRech] = useState<Set<string>>(new Set());
  const [reenviando, setReenviando] = useState(false);
  const [vehiclePicker, setVehiclePicker] = useState(false);
  const [buscarVehPicker, setBuscarVehPicker] = useState("");
  // Órdenes rechazadas por exceder capacidad del vehículo
  const [rechazadasCapacidad, setRechazadasCapacidad] = useState<
    { key: string; numeroOrden: string; kg: number }[]
  >([]);
  const [modalCapacidad, setModalCapacidad] = useState(false);
  const [buscarDiagrama, setBuscarDiagrama] = useState("");

  // Estados del modal "Enviar a Drivin"
  const [planModal, setPlanModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(null);
  const [planBase, setPlanBase] = useState("Distribucion TAT");
  const [planFecha, setPlanFecha] = useState("");
  const [planSchema, setPlanSchema] = useState("Distribucion Rutas Agropecuaria");
  const [planFlota, setPlanFlota] = useState("");
  const [schemas, setSchemas] = useState<string[]>(["Distribucion Rutas Agropecuaria", "Distribucion Rutas TAT"]);
  const [flotas, setFlotas] = useState<string[]>([]);
  // "nuevo" o "existente"
  const [planModo, setPlanModo] = useState<"nuevo" | "existente">("nuevo");
  const [planesExistentes, setPlanesExistentes] = useState<Plan[]>([]);
  const [planTokenSel, setPlanTokenSel] = useState("");
  const [loadingPlanes, setLoadingPlanes] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [vehs, ords] = await Promise.all([
        getVehiculosExternos(),
        getOrdenes(),
      ]);
      setVehiculos(vehs);
      setOrdenes(ords);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, []);

  // Recarga solo las órdenes (sin llamar a Drivin) para reflejar asignaciones al instante.
  const reloadOrdenes = useCallback(async () => {
    try {
      setOrdenes(await getOrdenes());
    } catch {
      // silencioso: la vista principal ya tiene error si load() falló
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const activos = vehiculos.filter((v) => v.estado === "Activo");
  // pendientes incluye Pendiente y Enviado (ambos son aún no entregados)
  const pendientes = agrupar(
    ordenes.filter(
      (o) => o.estado !== "Entregado" && o.estado !== "Rechazado"
    )
  );

  const sinAsignarGrupos = pendientes.filter((g) => !g.asignado);
  const conAsignacionGrupos = pendientes.filter((g) => g.asignado);

  const asignadasPorPlaca = (placa: string) =>
    pendientes.filter((g) => g.asignado === placa);

  const to = buscarOrd.trim().toLowerCase();
  const pendientesFiltrados = sinAsignarGrupos
    .filter((g) => (filtroDist === "" ? true : filtroDist === "TAT" ? g.distribucion === "TAT" : g.distribucion !== "TAT"))
    .filter((g) =>
      to
        ? [g.numeroOrden, g.cliente, g.destino].some((f) => f?.toLowerCase().includes(to))
        : true
    );

  const ta = buscarAsig.trim().toLowerCase();
  const asignadasFiltradas = ta
    ? conAsignacionGrupos.filter((g) =>
        [g.numeroOrden, g.cliente, g.destino, g.asignado].some((f) =>
          f?.toLowerCase().includes(ta)
        )
      )
    : conAsignacionGrupos;

  const asignadas = vehiculoSel ? asignadasPorPlaca(vehiculoSel.placa) : [];

  function toggle(key: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function asignar(vehiculo: VehiculoExterno) {
    const seleccionadas = pendientes.filter((g) => seleccion.has(g.key));
    if (seleccionadas.length === 0) return;

    // Usa la capacidad real si está definida; si no, la de Drivin.
    const capEfectiva = vehiculo.capacidadReal ?? vehiculo.capacidad;
    const capacidadMax = capEfectiva ? parseFloat(capEfectiva) : Infinity;
    const kgActual = asignadasPorPlaca(vehiculo.placa).reduce((s, g) => s + g.totalKg, 0);

    let kgAcumulado = kgActual;
    const queCaben: OrdenGrupo[] = [];
    const noQueCaben: { key: string; numeroOrden: string; kg: number }[] = [];

    for (const g of seleccionadas) {
      if (kgAcumulado + g.totalKg <= capacidadMax) {
        queCaben.push(g);
        kgAcumulado += g.totalKg;
      } else {
        noQueCaben.push({ key: g.key, numeroOrden: g.numeroOrden, kg: g.totalKg });
      }
    }

    setVehiclePicker(false);
    setVehiculoSel(vehiculo);

    if (queCaben.length === 0) {
      setRechazadasCapacidad(noQueCaben);
      setModalCapacidad(true);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const ids = queCaben.flatMap((g) => g.ids);
      await asignarOrdenes(ids, vehiculo.placa);
      const msg = queCaben.length === seleccionadas.length
        ? `Se asignaron ${queCaben.length} órdenes a ${vehiculo.placa}.`
        : `Se asignaron ${queCaben.length} de ${seleccionadas.length} órdenes a ${vehiculo.placa}.`;
      setMessage(msg);
      setSeleccion(new Set());
      await reloadOrdenes();
      if (noQueCaben.length > 0) {
        setRechazadasCapacidad(noQueCaben);
        setModalCapacidad(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al asignar");
    } finally {
      setSaving(false);
    }
  }

  async function quitar(g: OrdenGrupo) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await asignarOrdenes(g.ids, null);
      await reloadOrdenes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al quitar");
    } finally {
      setSaving(false);
    }
  }

  function toggleAsig(key: string) {
    setSeleccionAsig((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function quitarSeleccionadas() {
    const ids = asignadasFiltradas
      .filter((g) => seleccionAsig.has(g.key) && !g.enviado)
      .flatMap((g) => g.ids);
    if (ids.length === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await asignarOrdenes(ids, null);
      setSeleccionAsig(new Set());
      await reloadOrdenes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al quitar");
    } finally {
      setSaving(false);
    }
  }

  function abrirPlanModal() {
    const hoy = new Date().toISOString().slice(0, 10);
    setPlanFecha(hoy);
    setPlanBase("Distribucion TAT");
    setPlanModo("nuevo");
    setPlanTokenSel("");
    setPlanesExistentes([]);
    setPlanModal(true);
    const DEFAULTS = ["Distribucion Rutas Agropecuaria", "Distribucion Rutas TAT"];
    getSchemas().then((s) => setSchemas([...new Set([...DEFAULTS, ...s])].sort())).catch((err) => console.error(err));
    getFlotas().then((f) => setFlotas(f)).catch((err) => console.error(err));
    // Carga planes activos del día
    setLoadingPlanes(true);
    getPlanes(hoy)
      .then((ps) => {
        const activos = ps.filter((p) => p.status !== "Finished");
        setPlanesExistentes(activos);
        if (activos.length > 0) setPlanTokenSel(activos[0].token);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingPlanes(false));
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
        const duplicadas = Number(meta.duplicadas ?? 0);
        if (nuevas === 0) {
          setMessage(`Sin órdenes nuevas: las ${duplicadas} ya existían en ese plan.`);
        } else {
          setMessage(
            `Órdenes agregadas al plan "${meta.descripcion}": ${nuevas} nuevas· ${duplicadas} duplicadas omitidas.`
          );
        }
      } else {
        const result = await crearPlan({
          descripcion: `${planBase} ${planFecha.split('-').reverse().join('/')}`,
          fecha: planFecha,
          schemaName: planSchema,
          fleetName: planFlota || undefined,
        });
        meta = result._meta as PlanMeta;
        setMessage(
          `Plan creado en Drivin: ${meta.vehiculos} vehículos · ${meta.direcciones} paradas · ${meta.ordenes} órdenes.`
        );
      }
      setPlanMeta(meta);
      setPlanModal(false);
      await reloadOrdenes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al enviar a Drivin");
    } finally {
      setEnviando(false);
    }
  }

  // Solo cuenta las asignadas aún no enviadas (Pendiente) para el botón Enviar
  const ordenesAsignadas = pendientes.filter((g) => g.asignado && !g.enviado);

  // Kg totales de las órdenes seleccionadas para asignar
  const kgSeleccionado = pendientes
    .filter((g) => seleccion.has(g.key))
    .reduce((s, g) => s + g.totalKg, 0);

  // Órdenes rechazadas por Drivin, agrupadas con info de reenvío
  type RechGrupo = {
    key: string;
    numeroOrden: string;
    fecha: string;
    cliente: string;
    destino: string;
    reenviado: boolean;
    reenviadoAt: string | null;
    ids: string[];
    totalKg: number;
  };
  const rechazadosGrupos: RechGrupo[] = (() => {
    const map = new Map<string, RechGrupo>();
    for (const o of ordenes) {
      if (o.estado !== "Rechazado") continue;
      const key = `${o.numeroOrden}||${o.cliente}||${o.destino}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          numeroOrden: o.numeroOrden,
          fecha: o.fecha,
          cliente: o.cliente,
          destino: o.destino,
          reenviado: false,
          reenviadoAt: null,
          ids: [],
          totalKg: 0,
        };
        map.set(key, g);
      }
      g.ids.push(o.id);
      g.totalKg += o.cantidadKg;
      if (o.reenviado) {
        g.reenviado = true;
        if (o.reenviadoAt) g.reenviadoAt = o.reenviadoAt;
      }
    }
    return Array.from(map.values());
  })();

  const tr = buscarRechazados.trim().toLowerCase();
  const rechazadosFiltrados = tr
    ? rechazadosGrupos.filter((g) =>
        [g.numeroOrden, g.cliente, g.destino].some((f) =>
          f?.toLowerCase().includes(tr)
        )
      )
    : rechazadosGrupos;

  function toggleRech(key: string) {
    setSeleccionRech((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleReenviar() {
    const ids = rechazadosFiltrados
      .filter((g) => seleccionRech.has(g.key) && !g.reenviado)
      .flatMap((g) => g.ids);
    if (ids.length === 0) return;
    setReenviando(true);
    setError(null);
    setMessage(null);
    try {
      const { reenviados, errores } = await reenviarOrdenes(ids);
      let msg = `Se reenviaron ${reenviados} órdenes.`;
      if (errores.length > 0) msg += ` ${errores.length} con error: ${errores.join("; ")}`;
      setMessage(msg);
      setSeleccionRech(new Set());
      await reloadOrdenes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al reenviar");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-6 sm:p-8">
      <header className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">
            Asignación de órdenes
          </h1>
          <p className="text-sm text-[#5f7a68]">
            Asigna las órdenes pendientes y envíalas a Drivin como un plan.
          </p>
        </div>
      </header>

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#f0d4d1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Tabla de órdenes pendientes a todo el ancho y altura completa */}
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-[#14352a]">
                    Órdenes pendientes ({sinAsignarGrupos.length})
                  </h2>
                  {conAsignacionGrupos.length > 0 && (
                    <button
                      onClick={() => setVerAsignadas(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#e6effb] px-3 py-1 text-xs font-semibold text-[#1a5fb4] transition-colors hover:bg-[#d0e4f7]"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Ver asignadas ({conAsignacionGrupos.length})
                    </button>
                  )}
                  {/* Filtro por tipo de distribución */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFiltroDist(filtroDist === "GS" ? "" : "GS")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        filtroDist === "GS" ? "bg-[#2f8f4e] text-white" : "bg-[#e8f3e2] text-[#2f8f4e] hover:bg-[#d7eccd]"
                      }`}
                    >
                      Grandes Superficies
                    </button>
                    <button
                      onClick={() => setFiltroDist(filtroDist === "TAT" ? "" : "TAT")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        filtroDist === "TAT" ? "bg-[#b5731e] text-white" : "bg-[#fef3e6] text-[#b5731e] hover:bg-[#fbe6cd]"
                      }`}
                    >
                      TAT
                    </button>
                  </div>
                  {rechazadosGrupos.length > 0 && (
                    <button
                      onClick={() => setVerRechazados(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#fbeceb] px-3 py-1 text-xs font-semibold text-[#b3261e] transition-colors hover:bg-[#f7dedb]"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      Rechazados ({rechazadosGrupos.length})
                    </button>
                  )}
                </div>
                <SearchInput
                  value={buscarOrd}
                  onChange={setBuscarOrd}
                  placeholder="Buscar orden…"
                  className="w-56"
                />
              </div>
              <div className="nice-scroll min-h-0 flex-1 overflow-auto">
                <table className="w-full table-auto text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                    <tr>
                      <th className="px-4 py-3"></th>
                      <th className="px-4 py-3 font-semibold">No. Orden</th>
                      <th className="px-4 py-3 font-semibold">Código</th>
                      <th className="px-4 py-3 font-semibold">Distribución</th>
                      <th className="px-4 py-3 text-right font-semibold">Total (kg)</th>
                      <th className="px-4 py-3 font-semibold">Asignada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f2ee]">
                    {pendientesFiltrados.map((g) => (
                      <tr key={g.key} className="hover:bg-[#f9fbf7]">
                        <td className="px-4 py-2">
                          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[#2f8f4e]" checked={seleccion.has(g.key)} onChange={() => toggle(g.key)} />
                        </td>
                        <td className="px-4 py-2 font-medium text-[#14352a]">{g.numeroOrden || " "}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-[#45505e]">{`${tc(g.cliente)} - ${tc(g.destino)}`}</td>
                        <td className="px-4 py-2">
                          {g.distribucion === "TAT" ? (
                            <span className="inline-flex rounded-full bg-[#fef3e6] px-2.5 py-0.5 text-xs font-medium text-[#b5731e]">
                              {g.tatOrigen === "INVERSIONES"
                                ? "TAT Inversiones"
                                : g.tatOrigen === "AGROPECUARIA"
                                ? "TAT Agropecuaria"
                                : "TAT"}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">Agropecuaria</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-[#14352a]">{g.totalKg.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          {g.asignado ? (
                            <span className="inline-flex rounded-full bg-[#e6effb] px-2.5 py-0.5 text-xs font-medium text-[#1a5fb4]">{g.asignado}</span>
                          ) : (
                            <span className="text-xs text-[#a6b0a9]">""</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-4 py-3">
                <span className="text-sm text-[#5f7a68]">
                  {seleccion.size} seleccionadas
                  {kgSeleccionado > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-[#14352a]">
                        {kgSeleccionado.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg
                      </span>{" "}
                      a asignar
                    </>
                  )}
                </span>
                <button
                  onClick={() => { setBuscarVehPicker(""); setVehiclePicker(true); }}
                  disabled={saving || seleccion.size === 0}
                  className={btn}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1"/>
                    <path d="M16 8h4l3 3v5h-7V8z"/>
                    <circle cx="5.5" cy="18.5" r="2.5"/>
                    <circle cx="18.5" cy="18.5" r="2.5"/>
                  </svg>
                  Asignar vehículo
                </button>
              </div>
            </section>
        </div>
      )}

      {verRechazados && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVerRechazados(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">Órdenes rechazadas</h3>
                <p className="mt-0.5 text-sm text-[#5f7a68]">
                  {rechazadosGrupos.length} órdenes rechazadas por Drivin. Selecciona las que quieras reenviar.
                </p>
              </div>
              <button
                onClick={() => setVerRechazados(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3] hover:text-[#45505e]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="border-b border-[#eceef0] px-6 py-3">
              <SearchInput
                value={buscarRechazados}
                onChange={setBuscarRechazados}
                placeholder="Buscar orden, cliente o destino…"
                className="max-w-sm"
              />
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[#2f8f4e]"
                        checked={
                          rechazadosFiltrados.some((g) => !g.reenviado) &&
                          rechazadosFiltrados.filter((g) => !g.reenviado).every((g) => seleccionRech.has(g.key))
                        }
                        onChange={(e) =>
                          setSeleccionRech(
                            e.target.checked
                              ? new Set(rechazadosFiltrados.filter((g) => !g.reenviado).map((g) => g.key))
                              : new Set()
                          )
                        }
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">No. Orden</th>
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 text-right font-semibold">Total (kg)</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {rechazadosFiltrados.map((g, i) => (
                    <tr key={g.key} className="hover:bg-[#f9fbf7]">
                      <td className="px-4 py-3">
                        {!g.reenviado && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[#2f8f4e]"
                            checked={seleccionRech.has(g.key)}
                            onChange={() => toggleRech(g.key)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#7a8794]">{i + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">{g.fecha || " "}</td>
                      <td className="px-4 py-3 font-medium text-[#14352a]">{g.numeroOrden || " "}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">{`${tc(g.cliente)} - ${tc(g.destino)}`}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#14352a]">{g.totalKg.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {g.reenviado ? (
                          <span className="inline-flex flex-col">
                            <span className="inline-flex w-fit rounded-full bg-[#e6effb] px-2.5 py-0.5 text-xs font-medium text-[#1a5fb4]">
                              Reenviado
                            </span>
                            {g.reenviadoAt && (
                              <span className="mt-0.5 text-[11px] text-[#7a8794]">
                                {new Date(g.reenviadoAt).toLocaleString("es-CO")}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#fbeceb] px-2.5 py-0.5 text-xs font-medium text-[#b3261e]">
                            Rechazado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-6 py-4">
              <span className="text-sm text-[#5f7a68]">{seleccionRech.size} seleccionadas</span>
              <button
                onClick={handleReenviar}
                disabled={reenviando || seleccionRech.size === 0}
                className={btn}
              >
                {reenviando ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
                {reenviando ? "Reenviando…" : "Reenviar seleccionadas"}
              </button>
            </div>
          </div>
        </div>
      )}

      {vehiclePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setVehiclePicker(false)}>
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">Selecciona un vehículo</h3>
                <p className="text-sm text-[#5f7a68]">{seleccion.size} órdenes seleccionadas</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-[#e8f3e2] px-3.5 py-2">
                  <svg className="h-4 w-4 text-[#2f8f4e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7h-9M14 17H5M17 3l4 4-4 4M7 21l-4-4 4-4" />
                  </svg>
                  <span className="text-base font-bold tabular-nums text-[#2f8f4e]">
                    {kgSeleccionado.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg
                  </span>
                  <span className="text-xs font-medium text-[#5f7a68]">a cargar</span>
                </div>
                <button onClick={() => setVehiclePicker(false)} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="shrink-0 px-6 py-3 border-b border-[#eceef0]">
              <SearchInput
                value={buscarVehPicker}
                onChange={setBuscarVehPicker}
                placeholder="Buscar por placa o conductor…"
                className="w-full"
                autoFocus
              />
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Placa</th>
                    <th className="px-5 py-3 font-semibold">Conductor</th>
                    <th className="px-5 py-3 text-right font-semibold">Capacidad</th>
                    <th className="px-5 py-3 text-right font-semibold">Cap. real</th>
                    <th className="px-5 py-3 text-right font-semibold">Disponible</th>
                    <th className="px-5 py-3 font-semibold">Uso con la selección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {activos
                    .filter((v) => {
                      const t = buscarVehPicker.trim().toLowerCase();
                      return !t || [v.placa, v.conductor].some((f) => f?.toLowerCase().includes(t));
                    })
                    .map((v) => {
                      const kgUsado = asignadasPorPlaca(v.placa).reduce((s, g) => s + g.totalKg, 0);
                      const capNormal = v.capacidad ? parseFloat(v.capacidad) : null;
                      const capReal = v.capacidadReal ? parseFloat(v.capacidadReal) : null;
                      // Capacidad efectiva: la real si existe, si no la normal.
                      const cap = capReal ?? capNormal;
                      // Disponible tras cargar la selección actual (puede ser negativo).
                      const disponible = cap != null ? cap - kgUsado - kgSeleccionado : null;
                      const cabe = cap == null || disponible! >= 0;
                      const kgConSel = kgUsado + kgSeleccionado;
                      const pctConSel = cap ? (kgConSel / cap) * 100 : 0;
                      const wActual = cap ? Math.min(100, (kgUsado / cap) * 100) : 0;
                      const wSel = cap ? Math.min(100 - wActual, (kgSeleccionado / cap) * 100) : 0;
                      return (
                        <tr
                          key={v.id}
                          onClick={() => asignar(v)}
                          className="cursor-pointer hover:bg-[#f0f9f4] active:bg-[#e8f3e2]"
                        >
                          <td className="px-5 py-3">
                            <span className="rounded bg-yellow-300 px-2 py-0.5 text-sm font-bold tracking-wider text-[#14352a] border border-yellow-400">
                              {v.placa}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[#45505e]">{v.conductor || " "}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-[#45505e]">
                            {capNormal != null ? `${capNormal.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg` : " "}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {capReal != null ? (
                              <span className="font-medium text-[#14352a]">{capReal.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg</span>
                            ) : (
                              <span className="text-[#a6b0a9]">""</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`font-semibold tabular-nums ${cabe ? "text-[#2f8f4e]" : "text-[#b3261e]"}`}>
                              {disponible != null ? `${disponible.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg` : " "}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <div className="flex h-2.5 w-28 overflow-hidden rounded-full bg-[#e1e9dd]">
                                  <div
                                    className="h-full bg-[#9aa8a0]"
                                    style={{ width: `${wActual}%` }}
                                    title={`Cargado actual: ${kgUsado.toFixed(0)} kg`}
                                  />
                                  <div
                                    className={`h-full ${cabe ? "bg-[#2f8f4e]" : "bg-[#b3261e]"}`}
                                    style={{ width: `${wSel}%` }}
                                    title={`Selección: ${kgSeleccionado.toFixed(0)} kg`}
                                  />
                                </div>
                                <span className={`w-10 text-right text-xs font-semibold tabular-nums ${!cabe ? "text-[#b3261e]" : pctConSel > 90 ? "text-[#b5941e]" : "text-[#2f8f4e]"}`}>
                                  {pctConSel.toFixed(0)}%
                                </span>
                              </div>
                              <span className="text-[11px] text-[#7a8794]">
                                {kgConSel.toLocaleString("es-CO", { maximumFractionDigits: 0 })} / {cap != null ? cap.toLocaleString("es-CO", { maximumFractionDigits: 0 }) : " "} kg
                                {!cabe && <span className="ml-1 font-medium text-[#b3261e]">· No cabe</span>}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modalCapacidad && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-[#eceef0] px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbeceb] text-[#b3261e]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[#14352a]">Capacidad excedida</h3>
                  <p className="text-sm text-[#5f7a68]">
                    {vehiculoSel?.placa} · Cap. {vehiculoSel?.capacidad ?? " "} kg
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="mb-3 text-sm text-[#45505e]">
                Las siguientes órdenes <span className="font-semibold text-[#b3261e]">no se asignaron</span> porque el vehículo supera su capacidad de carga:
              </p>
              <div className="divide-y divide-[#f0f2ee] rounded-xl border border-[#f0d4d1] bg-[#fbeceb]">
                {rechazadasCapacidad.map((r) => (
                  <div key={r.key} className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-medium text-[#14352a]">{r.numeroOrden}</span>
                    <span className="text-sm text-[#b3261e]">{r.kg.toFixed(2)} kg</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[#7a8794]">
                Para asignarlas, usa un vehículo con mayor capacidad disponible o reduce las órdenes ya asignadas.
              </p>
            </div>
            <div className="flex justify-end border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={() => setModalCapacidad(false)}
                className="rounded-lg bg-[#14352a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1e4a38]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-10 py-8 shadow-xl">
            <svg className="h-10 w-10 animate-spin text-[#2f8f4e]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
            </svg>
            <p className="text-sm font-medium text-[#14352a]">Guardando asignación…</p>
          </div>
        </div>
      )}

      {verAsignadas && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVerAsignadas(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">
                  Estado de órdenes
                </h3>
                <p className="mt-0.5 text-sm text-[#5f7a68]">
                  <span className="font-medium text-[#1a5fb4]">Asignadas</span>: listas para enviar ·{" "}
                  <span className="font-medium text-[#2f8f4e]">Cargadas</span>: enviadas a Drivin
                </p>
              </div>
              <button
                onClick={() => setVerAsignadas(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="shrink-0 border-b border-[#eceef0] px-6 py-3">
              <SearchInput
                value={buscarAsig}
                onChange={setBuscarAsig}
                placeholder="Buscar por orden, código o vehículo…"
                className="max-w-sm"
              />
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[#2f8f4e]"
                        checked={
                          asignadasFiltradas.some((g) => !g.enviado) &&
                          asignadasFiltradas.filter((g) => !g.enviado).every((g) => seleccionAsig.has(g.key))
                        }
                        onChange={(e) =>
                          setSeleccionAsig(
                            e.target.checked
                              ? new Set(asignadasFiltradas.filter((g) => !g.enviado).map((g) => g.key))
                              : new Set()
                          )
                        }
                      />
                    </th>
                    <th className="w-10 px-2 py-2.5 font-semibold">#</th>
                    <th className="w-28 px-3 py-2.5 font-semibold">No. Orden</th>
                    <th className="px-3 py-2.5 font-semibold">Código</th>
                    <th className="w-24 px-3 py-2.5 text-right font-semibold">Total (kg)</th>
                    <th className="w-24 px-3 py-2.5 font-semibold">Vehículo</th>
                    <th className="w-24 px-3 py-2.5 font-semibold">Estado</th>
                    <th className="w-20 px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {asignadasFiltradas.map((g, i) => (
                    <tr key={g.key} className="hover:bg-[#f9fbf7]">
                      <td className="px-3 py-2">
                        {!g.enviado && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[#2f8f4e]"
                            checked={seleccionAsig.has(g.key)}
                            onChange={() => toggleAsig(g.key)}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 text-[#7a8794]">{i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-[#14352a]">{g.numeroOrden}</td>
                      <td className="truncate px-3 py-2 text-[#45505e]" title={`${tc(g.cliente)} - ${tc(g.destino)}`}>{`${tc(g.cliente)} - ${tc(g.destino)}`}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#14352a]">{g.totalKg.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full bg-[#e6effb] px-2.5 py-0.5 text-xs font-medium text-[#1a5fb4]">{g.asignado}</span>
                      </td>
                      <td className="px-3 py-2">
                        {g.enviado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                            Enviada
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#fef9e7] px-2.5 py-0.5 text-xs font-medium text-[#b5941e]">
                            Asignada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!g.enviado && (
                          <button onClick={() => quitar(g)} disabled={saving} className="rounded-lg border border-[#dfe4e0] bg-white px-2.5 py-1 text-xs font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-60">
                            Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {asignadasFiltradas.some((g) => !g.enviado) && (
              <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-6 py-4">
                <span className="text-sm text-[#5f7a68]">{seleccionAsig.size} seleccionadas</span>
                <button
                  onClick={quitarSeleccionadas}
                  disabled={saving || seleccionAsig.size === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#f0d4d1] bg-[#fbeceb] px-4 py-2.5 text-sm font-medium text-[#b3261e] transition-colors hover:bg-[#f7dedb] disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Quitar seleccionadas
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium uppercase tracking-wide text-[#7a8794]">
        {label}
      </dt>
      <dd className="text-[#14352a]">{valor || " "}</dd>
    </div>
  );
}

function PlanField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#45505e]">{label}</label>
      {children}
    </div>
  );
}
