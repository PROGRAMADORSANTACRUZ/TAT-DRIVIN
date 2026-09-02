"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { tc, btn, dlLabel } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import { PageLoader, SkeletonCard, SkeletonPlanillaCard } from "@/components/Loading";
import {
  ApiError,
  anularPlanilla,
  asignarOrdenes,
  addCambio,
  crearPlanilla,
  editarPlanilla,
  getCambios,
  getClientes,
  getOrdenes,
  getPlanillas,
  getVehiculosExternos,
  limpiarCambiosHechos,
  marcarCambioHecho,
  marcarImpresa,
  verificarClientesOrdenes,
  type CambioDespacho,
  type Cliente,
  type Orden,
  type Planilla,
  type PlanillaItem,
  type VehiculoExterno,
  type AnularPlanillaOverride,
} from "@/lib/api";
import { AUXILIARES, RUTAS, TIPOS_DESPACHO } from "@/data/planillaConfig";
import { getAuxiliares, getRutas } from "@/lib/api";
import { docRI, docRIT, imprimirDocumento } from "@/lib/planillaDocs";

// ── Modal de impresión reutilizable ─────────────────────────────────────────
function ImprimirModal({ planilla, onClose, onPrinted }: { planilla: Planilla; onClose: () => void; onPrinted?: () => void }) {
  // Marca como impresa en el backend al imprimir cualquier documento
  async function handleImprimir(doc: () => void) {
    doc();
    try { await marcarImpresa(planilla.id); onPrinted?.(); } catch { /* silencioso */ }
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

// Tipos de despacho eliminados del archivo — ahora vienen de planillaConfig.ts (TIPOS_DESPACHO)


const fmtKg = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function esHoy(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function claveCD(cliente: string, destino: string): string {
  const n = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  return `${n(cliente)}||${n(destino)}`;
}

function areaDe(o: Orden): string {
  if (o.distribucion === "TAT") return "TAT";
  const p = o.numeroOrden?.toUpperCase() ?? "";
  if (p.startsWith("B")) return "Bovino";
  if (p.startsWith("P")) return "Porcino";
  if (p.startsWith("I")) return "Inversiones";
  return "";
}

type Despacho = {
  placa: string;
  conductor: string | null;
  docs: number;
  kilos: number;
  clientes: string[];
};

function agruparDespachos(ordenes: Orden[], vehiculos: VehiculoExterno[]): Despacho[] {
  const conductorPorPlaca = new Map(vehiculos.map((v) => [v.placa.toUpperCase(), v.conductor]));
  const map = new Map<string, { conductor: string | null; kilos: number; docs: Set<string>; clientes: Set<string> }>();
  for (const o of ordenes) {
    if (!o.asignadoVehiculo) continue;
    if (o.estado === "Entregado" || o.estado === "Rechazado") continue;
    const placa = o.asignadoVehiculo.toUpperCase();
    let d = map.get(placa);
    if (!d) {
      d = { conductor: conductorPorPlaca.get(placa) ?? null, kilos: 0, docs: new Set(), clientes: new Set() };
      map.set(placa, d);
    }
    d.kilos += o.cantidadKg;
    d.docs.add(o.numeroOrden);
    d.clientes.add(`${tc(o.cliente)} — ${tc(o.destino)}`);
  }
  return Array.from(map.entries())
    .map(([placa, d]) => ({
      placa,
      conductor: d.conductor,
      docs: d.docs.size,
      kilos: d.kilos,
      clientes: Array.from(d.clientes).sort(),
    }))
    .sort((a, b) => a.placa.localeCompare(b.placa));
}

export default function PlanificacionDLPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [codigoPorClave, setCodigoPorClave] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [placaSel, setPlacaSel] = useState<string | null>(null);
  const [buscarDespacho, setBuscarDespacho] = useState("");
  const [buscarHist, setBuscarHist] = useState("");
  const [editando, setEditando] = useState<Planilla | null>(null);
  const [eliminando, setEliminando] = useState<Planilla | null>(null);
  const [creada, setCreada] = useState<Planilla | null>(null);
  const [imprimiendoPlanilla, setImprimiendoPlanilla] = useState<Planilla | null>(null);
  const [eliminandoItem, setEliminandoItem] = useState<{
    numeroOrden: string;
    ids: string[];
    vehiculoActual: string;
  } | null>(null);
  // Estado para confirmar anulación antes de cambiar datos de una planilla ya creada.
  // `override` lleva los datos NUEVOS con los que se creará la planilla de reemplazo.
  const [confirmandoAnulacion, setConfirmandoAnulacion] = useState<{
    planilla: Planilla;
    accion: "liberar" | "mantener" | string;
    override?: AnularPlanillaOverride;
  } | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [loadingAccion, setLoadingAccion] = useState(false);

  const [auxiliaresLS, setAuxiliaresLS] = useState(AUXILIARES);
  const [rutasLS, setRutasLS] = useState(RUTAS);

  const [origen, setOrigen] = useState("MALAMBO");
  const [horaSalida, setHoraSalida] = useState("");
  const [auxiliar, setAuxiliar] = useState("");
  const [tipos, setTipos] = useState<string[]>([]);
  const [ruta, setRuta] = useState("");
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ords, vehs, plans, clis] = await Promise.all([
        getOrdenes(),
        getVehiculosExternos(),
        getPlanillas(),
        getClientes(),
      ]);
      setOrdenes(ords);
      setVehiculos(vehs);
      setPlanillas(plans);
      setClientes(clis);
      verificarClientesOrdenes()
        .then((v) => {
          const m = new Map<string, string>();
          for (const r of v.registrados) if (r.codigo) m.set(claveCD(r.cliente, r.destino), r.codigo);
          setCodigoPorClave(m);
        })
        .catch(() => setCodigoPorClave(new Map()));
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

  // Cargar auxiliares y rutas desde la base de datos (config /api/config/*)
  useEffect(() => {
    getAuxiliares().then((data) => setAuxiliaresLS(data as typeof AUXILIARES)).catch((err) => console.error(err));
    getRutas().then((data) => setRutasLS(data as typeof RUTAS)).catch((err) => console.error(err));
  }, []);

  const despachos = useMemo(() => agruparDespachos(ordenes, vehiculos), [ordenes, vehiculos]);

  // Kg actualmente cargados por placa (para calcular capacidad al pasar remisiones).
  const cargaPorPlaca = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of despachos) m.set(d.placa.toUpperCase(), d.kilos);
    return m;
  }, [despachos]);

  // Plantillas creadas hoy y placas que ya tienen plantilla hoy (para ocultarlas).
  const planillasHoy = useMemo(
    () => planillas.filter((p) => esHoy(p.createdAt)),
    [planillas]
  );
  // Planillas de hoy que NO están anuladas bloquean la re-creación del despacho
  const placasConPlantillaHoy = useMemo(
    () => new Set(planillasHoy.filter((p) => !p.anulada).map((p) => p.placa.toUpperCase())),
    [planillasHoy]
  );

  // Consecutivo que se asignaría a la próxima planilla.
  const proximoConsecutivo = useMemo(
    () => planillas.reduce((m, p) => Math.max(m, p.consecutivo), 0) + 1,
    [planillas]
  );

  // Planillas de hoy pendientes de imprimir/reimprimir (no impresas y no anuladas).
  const sinImprimir = useMemo(
    () => planillasHoy.filter((p) => !p.impresa && !p.anulada),
    [planillasHoy]
  );

  // Modal de alerta de reimpresión: se abre automáticamente cuando aparecen pendientes.
  const [alertaReimprimir, setAlertaReimprimir] = useState(false);
  const alertaFirmaRef = useRef("");
  useEffect(() => {
    if (loading) return;
    const firma = sinImprimir.map((p) => p.id).sort().join(",");
    if (firma && firma !== alertaFirmaRef.current) {
      alertaFirmaRef.current = firma;
      setAlertaReimprimir(true);
    }
    if (!firma) alertaFirmaRef.current = "";
  }, [loading, sinImprimir]);

  // Reporte de cambios (movimientos entre vehículos, anulaciones, reimpresiones).
  const [cambios, setCambios] = useState<CambioDespacho[]>([]);
  const [mostrarCambios, setMostrarCambios] = useState(false);
  const refrescarCambios = useCallback(() => {
    getCambios().then(setCambios).catch((err) => console.error(err));
  }, []);
  useEffect(() => { refrescarCambios(); }, [refrescarCambios]);
  const cambiosPendientes = cambios.filter((c) => !c.hecho).length;

  const despachosFiltrados = useMemo(() => {
    const t = buscarDespacho.trim().toLowerCase();
    const base = despachos.filter((d) => !placasConPlantillaHoy.has(d.placa.toUpperCase()));
    if (!t) return base;
    return base.filter((d) => [d.placa, d.conductor].some((f) => f?.toLowerCase().includes(t)));
  }, [despachos, buscarDespacho, placasConPlantillaHoy]);

  const despacho = despachos.find((d) => d.placa === placaSel) ?? null;

  const clientePorCodigo = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientes) if (c.codigoDireccion) m.set(c.codigoDireccion.toUpperCase(), c);
    return m;
  }, [clientes]);

  // Construye los items (uno por documento/numeroOrden) para una placa.
  function buildItems(placa: string): PlanillaItem[] {
    const porOrden = new Map<string, { o: Orden; kg: number }>();
    for (const o of ordenes) {
      if (o.asignadoVehiculo?.toUpperCase() !== placa) continue;
      if (o.estado === "Entregado" || o.estado === "Rechazado") continue;
      const cur = porOrden.get(o.numeroOrden);
      if (cur) cur.kg += o.cantidadKg;
      else porOrden.set(o.numeroOrden, { o, kg: o.cantidadKg });
    }
    return Array.from(porOrden.values()).map(({ o, kg }) => {
      const codigo = codigoPorClave.get(claveCD(o.cliente, o.destino));
      const cli = codigo ? clientePorCodigo.get(codigo.toUpperCase()) : undefined;
      return {
        numeroOrden: o.numeroOrden,
        cliente: o.cliente,
        destino: o.destino,
        area: areaDe(o),
        codigoArea: `${o.cliente}-${o.destino}`.toUpperCase(),
        nombreDestino: cli?.nombreDireccion || tc(o.destino),
        direccion: cli?.direccion || "",
        kg,
      };
    });
  }

  function seleccionar(d: Despacho) {
    setPlacaSel(d.placa);
    setOrigen("MALAMBO");
    setHoraSalida(new Date().toTimeString().slice(0, 5));
    setAuxiliar("");
    setTipos([]);
    setRuta("");
    setMessage(null);
  }

  function toggleTipo(t: string) {
    setTipos((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleCrear() {
    if (!despacho) return;
    setGuardando(true);
    setError(null);
    setMessage(null);
    try {
      const items = buildItems(despacho.placa);
      const nueva = await crearPlanilla({
        fecha: new Date().toISOString().slice(0, 10),
        placa: despacho.placa,
        conductor: despacho.conductor,
        origen,
        horaSalida,
        auxiliarRuta: auxiliar || null,
        tipoDespacho: tipos.join(", ") || null,
        ruta: ruta || null,
        docs: despacho.docs,
        kilos: despacho.kilos,
        clientes: despacho.clientes,
        items,
      });
      setMessage(`Plantilla creada para ${despacho.placa}.`);
      setPlacaSel(null);
      setCreada(nueva);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la planilla");
    } finally {
      setGuardando(false);
    }
  }

  // Ids de órdenes vivas asignadas a una placa (para reasignar o liberar).
  function ordenIdsDePlaca(placa: string): string[] {
    return ordenes
      .filter(
        (o) =>
          o.asignadoVehiculo?.toUpperCase() === placa.toUpperCase() &&
          o.estado !== "Entregado" &&
          o.estado !== "Rechazado"
      )
      .map((o) => o.id);
  }

  // Ids de órdenes para un documento/placa específico (quitar remisión individual).
  function ordenIdsDeNumero(placa: string, numeroOrden: string): string[] {
    return ordenes
      .filter(
        (o) =>
          o.asignadoVehiculo?.toUpperCase() === placa.toUpperCase() &&
          o.numeroOrden === numeroOrden &&
          o.estado !== "Entregado" &&
          o.estado !== "Rechazado"
      )
      .map((o) => o.id);
  }

  // Suma de kg de un conjunto de órdenes (para saber cuánto pesa una remisión).
  const kgDeIds = (ids: string[]): number => {
    const set = new Set(ids);
    return ordenes.filter((o) => set.has(o.id)).reduce((s, o) => s + o.cantidadKg, 0);
  };

  // Anula la planilla (soft-delete para trazabilidad) y libera/reasigna la carga
  async function resolverEliminacion(destino: "liberar" | string) {
    const p = eliminando;
    if (!p) return;
    setLoadingAccion(true);
    setError(null);
    try {
      const ids = ordenIdsDePlaca(p.placa);
      if (ids.length > 0) {
        await asignarOrdenes(ids, destino === "liberar" ? null : destino);
      }
      await editarPlanilla(p.id, { anulada: true });
      setEliminando(null);
      setMessage(
        destino === "liberar"
          ? `Planilla ${dlLabel(p.consecutivo)} anulada. La carga volvió a asignación de órdenes.`
          : `Planilla ${dlLabel(p.consecutivo)} anulada. Carga reasignada al vehículo ${destino}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al anular");
    } finally {
      setLoadingAccion(false);
    }
  }

  // Confirma anulación desde el modal de edición (devolver/reasignar)
  async function ejecutarAnulacion() {
    const conf = confirmandoAnulacion;
    if (!conf) return;
    setAnulando(true);
    setLoadingAccion(true);
    setError(null);
    try {
      // Reasignar las órdenes según la acción: a otro vehículo, liberar, o mantener.
      if (conf.accion !== "mantener") {
        const ids = ordenIdsDePlaca(conf.planilla.placa);
        if (ids.length > 0) {
          await asignarOrdenes(ids, conf.accion === "liberar" ? null : conf.accion);
        }
      }
      // Anula la original y crea la nueva planilla (con los datos nuevos si los hay).
      const { nueva } = await anularPlanilla(conf.planilla.id, conf.override);
      await addCambio({
        tipo: "anulacion",
        deVehiculo: conf.planilla.placa,
        aVehiculo: conf.override?.placa ?? conf.planilla.placa,
        dlOrigen: conf.planilla.consecutivo,
        dlNuevo: nueva.consecutivo,
        detalle: `Planilla anulada y regenerada`,
      });
      refrescarCambios();
      setConfirmandoAnulacion(null);
      setMessage(
        `Planilla ${dlLabel(conf.planilla.consecutivo)} anulada. Se creó la ${dlLabel(nueva.consecutivo)}. Imprímela.`
      );
      await load();
      // Abre la nueva para imprimir.
      setImprimiendoPlanilla(nueva);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al anular planilla");
    } finally {
      setAnulando(false);
      setLoadingAccion(false);
    }
  }

  const histFiltrado = useMemo(() => {
    const t = buscarHist.trim().toLowerCase();
    if (!t) return planillasHoy;
    return planillasHoy.filter((p) =>
      [String(p.consecutivo), p.placa, p.conductor, p.ruta].some((f) => f?.toLowerCase().includes(t))
    );
  }, [planillasHoy, buscarHist]);

  // Quitar una remisión individual antes de crear la planilla.
  async function resolverEliminacionItem(destino: "liberar" | string) {
    if (!eliminandoItem) return;
    setLoadingAccion(true);
    setError(null);
    try {
      // Si el destino ya tiene una planilla activa hoy, se AÑADE la remisión a esa
      // planilla y se marca para REIMPRESIÓN (no se anula).
      if (destino !== "liberar") {
        const planillaDestinoHoy = planillasHoy.find(
          (p) => p.placa.toUpperCase() === destino.toUpperCase() && !p.anulada
        );
        if (planillaDestinoHoy) {
          await asignarOrdenes(eliminandoItem.ids, destino);
          const ords = ordenes.filter((o) => eliminandoItem.ids.includes(o.id));
          const kg = ords.reduce((s, o) => s + o.cantidadKg, 0);
          const o0 = ords[0];
          let itemsDestino = planillaDestinoHoy.items ?? [];
          if (o0) {
            const codigo = codigoPorClave.get(claveCD(o0.cliente, o0.destino));
            const cli = codigo ? clientePorCodigo.get(codigo.toUpperCase()) : undefined;
            const nuevoItem: PlanillaItem = {
              numeroOrden: eliminandoItem.numeroOrden,
              cliente: o0.cliente,
              destino: o0.destino,
              area: areaDe(o0),
              codigoArea: `${o0.cliente}-${o0.destino}`.toUpperCase(),
              nombreDestino: cli?.nombreDireccion || tc(o0.destino),
              direccion: cli?.direccion || "",
              kg,
            };
            itemsDestino = [
              ...itemsDestino.filter((it) => it.numeroOrden !== eliminandoItem.numeroOrden),
              nuevoItem,
            ];
          }
          // impresa=false conserva impresaAt → la plantilla queda marcada "Reimpresión".
          await editarPlanilla(planillaDestinoHoy.id, { items: itemsDestino, impresa: false });
          await addCambio({
            tipo: "reimpresion",
            remision: eliminandoItem.numeroOrden,
            deVehiculo: eliminandoItem.vehiculoActual,
            aVehiculo: destino,
            dlOrigen: planillaDestinoHoy.consecutivo,
            detalle: "Remisión agregada a la plantilla de hoy (requiere reimpresión)",
          });
          refrescarCambios();
          setEliminandoItem(null);
          setMessage(`Remisión movida a ${destino}. La planilla ${dlLabel(planillaDestinoHoy.consecutivo)} necesita reimpresión.`);
          await load();
          return;
        }
      }
      await asignarOrdenes(eliminandoItem.ids, destino === "liberar" ? null : destino);
      await addCambio(
        destino === "liberar"
          ? { tipo: "liberacion", remision: eliminandoItem.numeroOrden, deVehiculo: eliminandoItem.vehiculoActual, detalle: "Remisión devuelta a asignación" }
          : { tipo: "movimiento", remision: eliminandoItem.numeroOrden, deVehiculo: eliminandoItem.vehiculoActual, aVehiculo: destino, detalle: "Remisión movida a otro vehículo" }
      );
      refrescarCambios();
      setEliminandoItem(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al reasignar remisión");
    } finally {
      setLoadingAccion(false);
    }
  }

  const items = despacho ? buildItems(despacho.placa) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 sm:p-8">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Planificación de Distribución Logística</h1>
          <p className="text-sm text-[#5f7a68]">
            Genera la planilla de cada vehículo que sale a ruta hoy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loadingAccion && (
            <span className="flex items-center gap-1.5 text-xs text-[#7a8794]">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z"/></svg>
              Actualizando…
            </span>
          )}
          <Link
            href="/historicos"
            className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            Ver históricos
          </Link>
          <button
            onClick={() => setMostrarCambios(true)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            Reporte de cambios
            {cambiosPendientes > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b3261e] px-1 text-[10px] font-bold text-white">{cambiosPendientes}</span>
            )}
          </button>
        </div>
      </header>

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          {/* Skeleton panel izquierdo */}
          <div className="flex min-h-0 w-full flex-col gap-2 lg:w-[380px] lg:shrink-0">
            <div className="flex-1 overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white p-3 shadow-sm">
              <div className="mb-3 h-4 w-24 animate-pulse rounded-full bg-[#e8ecea]" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} className="h-20" />
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white p-3 shadow-sm">
              <div className="mb-3 h-4 w-32 animate-pulse rounded-full bg-[#e8ecea]" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonPlanillaCard key={i} />
                ))}
              </div>
            </div>
          </div>
          {/* Skeleton panel derecho */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
            <PageLoader />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">

          {/* ── PANEL IZQUIERDO ───────────────────────────────── */}
          <div className="flex min-h-0 w-full flex-col gap-4 lg:w-[380px] lg:shrink-0">

            {/* Despachos — grid 2 columnas */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
              <div className="shrink-0 border-b border-[#eceef0] px-4 py-3">
                <h2 className="mb-2 text-sm font-semibold text-[#14352a]">Despachos ({despachosFiltrados.length})</h2>
                <SearchInput value={buscarDespacho} onChange={setBuscarDespacho} placeholder="Buscar placa o conductor…" className="w-full" />
              </div>
              <div className="nice-scroll min-h-0 flex-1 overflow-auto p-3">
                {despachosFiltrados.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[#5f7a68]">No hay vehículos con órdenes asignadas.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {despachosFiltrados.map((d) => {
                      const activo = d.placa === placaSel;
                      return (
                        <button
                          key={d.placa}
                          onClick={() => seleccionar(d)}
                          className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition-all ${
                            activo
                              ? "border-[#2f8f4e] bg-[#f2f8ef] shadow-sm"
                              : "border-[#e1e9dd] bg-white hover:border-[#c5daca] hover:bg-[#f9fbf7]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-bold tracking-wider text-[#14352a] ring-1 ring-yellow-400">{d.placa}</span>
                            <span className="text-[10px] font-medium text-[#7a8794]">{d.docs}d</span>
                          </div>
                          <span className="truncate text-[11px] text-[#45505e]">{d.conductor || "Sin conductor"}</span>
                          <span className="text-[11px] font-semibold text-[#2f8f4e]">{fmtKg(d.kilos)} kg</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Plantillas de hoy — grid 2x2 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#eceef0] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#14352a]">Plantillas de hoy ({planillasHoy.length})</h2>
                <SearchInput value={buscarHist} onChange={setBuscarHist} placeholder="Buscar…" className="w-36" />
              </div>
              <div className="nice-scroll min-h-0 flex-1 overflow-auto p-3">
                {histFiltrado.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[#5f7a68]">Aún no se han generado plantillas hoy.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {histFiltrado.map((p) => (
                      <div key={p.id} className={`flex flex-col rounded-xl border p-2.5 ${p.anulada ? "border-[#f0c4c1] bg-[#fbeceb] opacity-70" : "border-[#e1e9dd] bg-[#f9fbf7]"}`}>
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-bold text-[#7a8794]">{dlLabel(p.consecutivo)}</span>
                          <span className="rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-bold tracking-wider text-[#14352a] ring-1 ring-yellow-400">{p.placa}</span>
                          {p.anulada ? (
                            <span className="rounded bg-[#fbeceb] px-1 py-0.5 text-[9px] font-bold uppercase text-[#b3261e]">Anulado</span>
                          ) : p.impresa ? (
                            <span className="rounded bg-[#e8f3e2] px-1 py-0.5 text-[9px] font-bold uppercase text-[#2f8f4e]">Impreso</span>
                          ) : p.impresaAt ? (
                            <span className="rounded bg-[#fdf0e6] px-1 py-0.5 text-[9px] font-bold uppercase text-[#7c4a00]">Reimpresión</span>
                          ) : (
                            <span className="rounded bg-[#fdf6e9] px-1 py-0.5 text-[9px] font-bold uppercase text-[#a86a12]">Sin imprimir</span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[#45505e]">{p.conductor || "Sin conductor"}</p>
                        {p.ruta && <p className="truncate text-[10px] text-[#7a8794]">{p.ruta}</p>}
                        {p.auxiliarRuta && <p className="truncate text-[10px] text-[#7a8794]">Aux: {p.auxiliarRuta}</p>}
                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <span className="text-[#45505e]">{p.docs}d</span>
                          <span className="font-semibold text-[#14352a]">{fmtKg(p.kilos)} kg</span>
                        </div>
                        {p.anulada && p.reemplazadaPorConsecutivo && (
                          <p className="mt-0.5 text-[10px] text-[#7a8794]">Reemplazada por {dlLabel(p.reemplazadaPorConsecutivo)}</p>
                        )}
                        {p.reemplazaDeConsecutivo && (
                          <p className="mt-0.5 text-[10px] text-[#2f8f4e]">Reemplazo de {dlLabel(p.reemplazaDeConsecutivo)}</p>
                        )}
                        {!p.anulada && (
                          <div className="mt-1.5 flex items-center justify-end gap-1">
                            <button onClick={() => setImprimiendoPlanilla(p)} title="Imprimir" className="rounded border border-[#dfe4e0] bg-white p-1 text-[#45505e] hover:bg-[#f4f6f3]">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                              </svg>
                            </button>
                            <button onClick={() => setEditando(p)} title="Editar" className="rounded border border-[#f0d9b0] bg-[#fdf6e9] p-1 text-[#a86a12] hover:bg-[#faedd4]">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button onClick={() => setEliminando(p)} title="Anular" className="rounded border border-[#dfe4e0] bg-white p-1 text-[#b3261e] hover:bg-[#fbeceb]">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
          {/* ── FIN PANEL IZQUIERDO ───────────────────────────── */}

          {/* ── PANEL DERECHO: formulario ─────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
            {!despacho ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f3e2] text-[#2f8f4e]">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium text-[#45505e]">Selecciona un despacho</p>
                  <p className="mt-0.5 text-xs text-[#7a8794]">Elige un vehículo de la izquierda para armar su planilla.</p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Header del vehículo */}
                <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-[#eceef0] bg-[#14352a] px-6 py-4">
                  <div className="flex flex-col items-center justify-center rounded-lg border-4 border-yellow-400 bg-yellow-300 px-3 py-1 shadow-inner">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#14352a]">Colombia</span>
                    <span className="text-lg font-extrabold leading-none tracking-widest text-[#14352a]">{despacho.placa}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{despacho.conductor || "Sin conductor"}</p>
                    <p className="text-xs text-[#a7c4b5]">{despacho.docs} documentos · {fmtKg(despacho.kilos)} kg</p>
                  </div>
                  <div className="flex flex-col gap-1 text-right text-xs">
                    <span className="font-bold text-yellow-300">{dlLabel(proximoConsecutivo)}</span>
                    <span className="text-[#a7c4b5]">Ruta: <span className="font-semibold text-white">{ruta || "—"}</span></span>
                    <span className="text-[#a7c4b5]">Auxiliar: <span className="font-semibold text-white">{auxiliar || "—"}</span></span>
                  </div>
                </div>

                {/* 1. Tipo de despacho — primero */}
                <div className="flex shrink-0 flex-col gap-1.5 px-6 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
                    Tipo de despacho <span className="font-normal normal-case text-[#a6b0a9]">(marca todo lo que aplica)</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIPOS_DESPACHO.map((t) => {
                      const on = tipos.includes(t);
                      return (
                        <button key={t} type="button" onClick={() => toggleTipo(t)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-[#2f8f4e] bg-[#e8f3e2] text-[#2f8f4e]" : "border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]"}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${on ? "bg-[#2f8f4e]" : "bg-[#dfe4e0]"}`} />
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Ruta y auxiliar */}
                <div className="grid shrink-0 grid-cols-1 gap-3 border-t border-[#eceef0] px-6 py-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[#7a8794]">Ruta y destino</span>
                    <select value={ruta} onChange={(e) => setRuta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
                      <option value="">Selecciona una ruta…</option>
                      {rutasLS.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}{r.ciudad ? ` — ${r.ciudad}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[#7a8794]">Auxiliar de ruta</span>
                    <select value={auxiliar} onChange={(e) => setAuxiliar(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
                      <option value="">Selecciona…</option>
                      {auxiliaresLS.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                    </select>
                  </label>
                </div>

                {/* 3. Remisiones — scroll interno, cards slim */}
                <div className="nice-scroll flex min-h-0 flex-1 flex-col overflow-auto border-t border-[#eceef0] px-6 py-3">
                  <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#7a8794]">
                    Remisiones ({items.length})
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-[#7a8794]">No hay remisiones cargadas en este vehículo.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-[#f0f2ee]">
                      {items.map((item) => (
                        <div key={item.numeroOrden} className="flex items-center gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-[#14352a]">{item.numeroOrden}</span>
                              {item.area && <span className="rounded bg-[#e8f3e2] px-1.5 py-0.5 text-[10px] font-semibold text-[#2f8f4e]">{item.area}</span>}
                              <span className="text-xs text-[#45505e]">{tc(item.cliente)}</span>
                              <span className="text-[10px] text-[#7a8794]">—</span>
                              <span className="truncate text-xs text-[#45505e]">{item.nombreDestino || tc(item.destino)}</span>
                              {item.direccion && <span className="text-[10px] text-[#7a8794]">{item.direccion}</span>}
                              <span className="ml-auto font-semibold text-xs text-[#14352a]">{fmtKg(item.kg)} kg</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setEliminandoItem({ numeroOrden: item.numeroOrden, ids: ordenIdsDeNumero(despacho.placa, item.numeroOrden), vehiculoActual: despacho.placa })}
                            title="Quitar remisión"
                            className="shrink-0 rounded-lg p-1 text-[#b3261e] opacity-50 transition-opacity hover:opacity-100"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
                  <button onClick={() => setPlacaSel(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">Cancelar</button>
                  <button onClick={handleCrear} disabled={guardando} className={btn}>
                    {guardando ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                    )}
                    {guardando ? "Creando…" : "Crear plantilla"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* ── FIN PANEL DERECHO ─────────────────────────────── */}

        </div>
      )}

      {editando && (
        <EditarPlanillaModal
          planilla={editando}
          vehiculos={vehiculos}
          ordenes={ordenes}
          cargaPorPlaca={cargaPorPlaca}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            setMessage("Plantilla actualizada.");
            load();
          }}
          onAnular={(planilla, accion, override) => {
            setEditando(null);
            setConfirmandoAnulacion({ planilla, accion, override });
          }}
        />
      )}

      {/* Modal confirmación anulación */}
      {confirmandoAnulacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdf6e9] text-[#a86a12]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#14352a]">Confirmar cambio</h3>
                <p className="text-xs text-[#7a8794]">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#f0d9b0] bg-[#fdf6e9] px-4 py-3 text-sm text-[#a86a12]">
              La planilla <strong>{dlLabel(confirmandoAnulacion.planilla.consecutivo)}</strong> de{" "}
              <strong>{confirmandoAnulacion.planilla.placa}</strong> será marcada como <strong>ANULADA</strong> y
              se creará una nueva con un consecutivo diferente para mantener la trazabilidad.
            </div>
            <p className="mt-3 text-sm text-[#5f7a68]">
              La carga será{" "}
              {confirmandoAnulacion.accion === "liberar"
                ? "devuelta a asignación de vehículos"
                : confirmandoAnulacion.accion === "mantener"
                ? "conservada en el mismo vehículo"
                : `reasignada al vehículo ${confirmandoAnulacion.accion}`}
              .
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button onClick={() => setConfirmandoAnulacion(null)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={ejecutarAnulacion} disabled={anulando} className="rounded-lg bg-[#a86a12] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#8f590f] disabled:opacity-60">
                {anulando ? "Anulando…" : "Confirmar y anular"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Imprimir tras crear */}
      {creada && <ImprimirModal planilla={creada} onClose={() => setCreada(null)} onPrinted={() => load()} />}

      {/* Modal: Reporte de cambios */}
      {mostrarCambios && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">Reporte de cambios</h3>
                <p className="text-xs text-[#7a8794]">{cambiosPendientes} pendiente{cambiosPendientes !== 1 ? "s" : ""} de {cambios.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { limpiarCambiosHechos().then(refrescarCambios).catch((err) => console.error(err)); }} className="rounded-lg border border-[#dfe4e0] px-3 py-1.5 text-xs font-medium text-[#45505e] hover:bg-[#f4f6f3]">Limpiar hechos</button>
                <button onClick={() => setMostrarCambios(false)} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-auto p-4">
              {cambios.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#7a8794]">Sin cambios registrados.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...cambios].reverse().map((c) => {
                    const tipoLabel = c.tipo === "movimiento" ? "Movimiento" : c.tipo === "anulacion" ? "Anulación" : c.tipo === "reimpresion" ? "Reimpresión" : "Liberación";
                    const tipoColor = c.tipo === "anulacion" ? "bg-[#fbeceb] text-[#b3261e]" : c.tipo === "movimiento" ? "bg-[#eef2f8] text-[#4a6fa5]" : c.tipo === "reimpresion" ? "bg-[#fdf6e9] text-[#a86a12]" : "bg-[#eceef0] text-[#6b7683]";
                    return (
                      <label key={c.id} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${c.hecho ? "border-[#e1e9dd] bg-[#f7faf5] opacity-60" : "border-[#e1e9dd] bg-white"}`}>
                        <input type="checkbox" checked={c.hecho} onChange={(e) => { marcarCambioHecho(c.id, e.target.checked).then(refrescarCambios).catch((err) => console.error(err)); }} className="mt-0.5 h-4 w-4 accent-[#2f8f4e]" />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tipoColor}`}>{tipoLabel}</span>
                            {c.remision && <span className="font-mono text-xs font-semibold text-[#14352a]">{c.remision}</span>}
                            <span className="text-[10px] text-[#7a8794]">{new Date(c.createdAt).toLocaleString("es-CO")}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#45505e]">
                            {c.deVehiculo && <>De <strong>{c.deVehiculo}</strong></>}
                            {c.aVehiculo && <> → a <strong>{c.aVehiculo}</strong></>}
                            {c.dlOrigen != null && <> · {dlLabel(c.dlOrigen)}</>}
                            {c.dlNuevo != null && <> → {dlLabel(c.dlNuevo)}</>}
                          </p>
                          {c.detalle && <p className="text-[11px] text-[#7a8794]">{c.detalle}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de alerta: planillas pendientes de imprimir / reimprimir */}
      {alertaReimprimir && sinImprimir.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdf6e9] text-[#a86a12]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#14352a]">Planillas por imprimir / reimprimir</h3>
                <p className="text-xs text-[#7a8794]">Hay {sinImprimir.length} planilla{sinImprimir.length !== 1 ? "s" : ""} pendiente{sinImprimir.length !== 1 ? "s" : ""}.</p>
              </div>
            </div>
            <div className="nice-scroll max-h-64 overflow-auto rounded-xl border border-[#f0d9b0] bg-[#fdf6e9] p-2">
              {sinImprimir.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setImprimiendoPlanilla(p); setAlertaReimprimir(false); }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#a86a12] transition-colors hover:bg-[#faedd4]"
                >
                  <span className="font-semibold">{dlLabel(p.consecutivo)} · {p.placa}</span>
                  <span className="inline-flex items-center gap-1 text-xs">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setAlertaReimprimir(false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Entendido</button>
            </div>
          </div>
        </div>
      )}

      {/* Imprimir desde tarjeta de plantilla */}
      {imprimiendoPlanilla && (
        <ImprimirModal planilla={imprimiendoPlanilla} onClose={() => setImprimiendoPlanilla(null)} onPrinted={() => load()} />
      )}

      {/* Eliminar plantilla completa */}
      {eliminando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#14352a]">Anular plantilla {dlLabel(eliminando.consecutivo)}</h3>
            <p className="mt-1 text-sm text-[#5f7a68]">
              La planilla de <span className="font-semibold">{eliminando.placa}</span> ({eliminando.docs} docs) será <strong>anulada</strong> para mantener trazabilidad y se creará una copia nueva. ¿Qué deseas hacer con la carga?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => resolverEliminacion("liberar")} className="flex items-start gap-3 rounded-lg border border-[#dfe4e0] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f4f6f3]">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#2f8f4e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
                </svg>
                <span>
                  <span className="block text-sm font-semibold text-[#14352a]">Devolver a asignación de vehículos</span>
                  <span className="block text-xs text-[#7a8794]">La carga queda sin vehículo para reasignarla.</span>
                </span>
              </button>
              <div className="rounded-lg border border-[#dfe4e0] px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-[#14352a]">Pasar a otro vehículo</p>
                <select defaultValue="" onChange={(e) => e.target.value && resolverEliminacion(e.target.value)} className="w-full rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
                  <option value="">Selecciona un vehículo…</option>
                  {vehiculos
                    .filter((v) => v.placa.toUpperCase() !== eliminando.placa.toUpperCase())
                    .map((v) => <option key={v.id} value={v.placa}>{v.placa} — {v.conductor ?? ""}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => setEliminando(null)} className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-[#7a8794] transition-colors hover:bg-[#f4f6f3]">Cancelar</button>
          </div>
        </div>
      )}

      {/* Quitar remisión individual (antes de crear planilla) */}
      {eliminandoItem && (
        <QuitarRemisionModal
          numeroOrden={eliminandoItem.numeroOrden}
          remisionKg={kgDeIds(eliminandoItem.ids)}
          vehiculoActual={eliminandoItem.vehiculoActual}
          vehiculos={vehiculos}
          cargaPorPlaca={cargaPorPlaca}
          loading={loadingAccion}
          devolver={{
            titulo: "Devolver a carga de órdenes",
            descripcion: "La remisión queda disponible para asignarse de nuevo.",
            onClick: () => resolverEliminacionItem("liberar"),
          }}
          onPasar={(placa) => resolverEliminacionItem(placa)}
          onClose={() => setEliminandoItem(null)}
        />
      )}
    </div>
  );
}

// ── Modal de edición de plantilla ────────────────────────────────────────────
function EditarPlanillaModal({
  planilla,
  vehiculos,
  ordenes,
  cargaPorPlaca,
  onClose,
  onSaved,
  onAnular,
}: {
  planilla: Planilla;
  vehiculos: VehiculoExterno[];
  ordenes: Orden[];
  cargaPorPlaca: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
  onAnular: (planilla: Planilla, accion: "liberar" | "mantener" | string, override?: AnularPlanillaOverride) => void;
}) {
  const [placa, setPlaca] = useState(planilla.placa);
  const [auxiliar, setAuxiliar] = useState(planilla.auxiliarRuta ?? "");
  const [ruta, setRuta] = useState(planilla.ruta ?? "");
  const [items, setItems] = useState<PlanillaItem[]>(planilla.items ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitandoItem, setQuitandoItem] = useState<PlanillaItem | null>(null);

  const totalKg = items.reduce((s, i) => s + (Number(i.kg) || 0), 0);

  const fmtKg = (n: number) =>
    n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function confirmarQuitarItem(item: PlanillaItem) {
    setItems((prev) => prev.filter((x) => x.numeroOrden !== item.numeroOrden));
    setQuitandoItem(null);
  }

  // Pasa la remisión a otro vehículo: reasigna la orden y la quita del documento.
  async function handlePasarItem(item: PlanillaItem, destino: string) {
    const ids = ordenes
      .filter(
        (o) =>
          o.numeroOrden === item.numeroOrden &&
          o.asignadoVehiculo?.toUpperCase() === planilla.placa.toUpperCase() &&
          o.estado !== "Entregado" &&
          o.estado !== "Rechazado"
      )
      .map((o) => o.id);
    try {
      if (ids.length > 0) await asignarOrdenes(ids, destino);
      confirmarQuitarItem(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al pasar remisión");
    }
  }

  async function handleGuardar() {
    setSaving(true);
    setError(null);
    try {
      const conductor = vehiculos.find((v) => v.placa.toUpperCase() === placa.toUpperCase())?.conductor ?? planilla.conductor;
      const nuevosItems = items.map((i) => ({ ...i, kg: Number(i.kg) || 0 }));

      const itemsOriginales = planilla.items ?? [];
      const itemsCambiaron =
        nuevosItems.length !== itemsOriginales.length ||
        nuevosItems.some((it, i) => it.numeroOrden !== itemsOriginales[i]?.numeroOrden || Math.abs(it.kg - (itemsOriginales[i]?.kg ?? 0)) > 0.01);
      const placaCambio = placa.toUpperCase() !== planilla.placa.toUpperCase();
      const auxiliarCambio = (auxiliar || "") !== (planilla.auxiliarRuta ?? "");
      const rutaCambio = (ruta || "") !== (planilla.ruta ?? "");

      // Sin cambios: cerrar sin tocar nada.
      if (!placaCambio && !auxiliarCambio && !rutaCambio && !itemsCambiaron) {
        onClose();
        return;
      }

      // Cambio de placa / conductor / auxiliar / ruta → ANULAR y crear nueva imprimible
      // (con trazabilidad "reemplazada por / reemplaza de"). Incluye los items actuales.
      if (placaCambio || auxiliarCambio || rutaCambio) {
        onAnular(planilla, placaCambio ? placa : "mantener", {
          placa,
          conductor,
          auxiliarRuta: auxiliar || null,
          ruta: ruta || null,
          items: nuevosItems,
        });
        return;
      }

      // Solo cambiaron documentos/remisiones → NO se anula, se marca para REIMPRIMIR.
      await editarPlanilla(planilla.id, {
        placa,
        conductor,
        auxiliarRuta: auxiliar || null,
        ruta: ruta || null,
        items: nuevosItems,
        impresa: false,
      });
      await addCambio({
        tipo: "reimpresion",
        deVehiculo: planilla.placa,
        dlOrigen: planilla.consecutivo,
        detalle: "Cambiaron documentos/remisiones — reimprimir",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[#eceef0] px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[#14352a]">
              <svg className="h-5 w-5 text-[#a86a12]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Editar plantilla
            </h3>
            <p className="mt-0.5 text-sm text-[#5f7a68]">
              Consecutivo {dlLabel(planilla.consecutivo)} · {new Date(planilla.createdAt).toLocaleString("es-CO")}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-[#eceef0] px-6 py-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Placa</span>
            <select value={placa} onChange={(e) => setPlaca(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
              <option value={planilla.placa}>{planilla.placa} — {planilla.conductor ?? ""}</option>
              {vehiculos.filter((v) => v.placa.toUpperCase() !== planilla.placa.toUpperCase()).map((v) => (
                <option key={v.id} value={v.placa}>{v.placa} — {v.conductor ?? ""}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Auxiliar</span>
            <select value={auxiliar} onChange={(e) => setAuxiliar(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
              <option value="">Selecciona…</option>
              {AUXILIARES.map((a) => <option key={a.nombre} value={a.nombre}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#7a8794]">Ruta</span>
            <select value={ruta} onChange={(e) => setRuta(e.target.value)} className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20">
              <option value="">Selecciona…</option>
              {RUTAS.map((r) => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
          </label>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-[#f0d4d1] bg-[#fbeceb] px-4 py-2 text-sm text-[#b3261e]">{error}</div>
        )}

        <div className="nice-scroll min-h-0 flex-1 overflow-auto px-6 py-3">
          <table className="w-full table-auto text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-[#7a8794]">
              <tr>
                <th className="py-2 font-semibold">Docto.</th>
                <th className="py-2 font-semibold">Área</th>
                <th className="py-2 font-semibold">Destino</th>
                <th className="py-2 text-right font-semibold">Kilos</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {items.map((it, idx) => (
                <tr key={`${it.numeroOrden}-${idx}`}>
                  <td className="py-2 font-medium text-[#14352a]">{it.numeroOrden}</td>
                  <td className="py-2 text-[#45505e]">{it.area}</td>
                  <td className="py-2 text-[#45505e]">{it.nombreDestino || it.destino}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      value={it.kg}
                      onChange={(e) =>
                        setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, kg: Number(e.target.value) } : x)))
                      }
                      className="w-28 rounded-lg border border-[#dfe4e0] bg-white px-2 py-1.5 text-right text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                    />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      onClick={() => setQuitandoItem(it)}
                      className="rounded-lg bg-[#fbeceb] p-2 text-[#b3261e] transition-colors hover:bg-[#f7dedb]"
                      aria-label="Quitar remisión"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#5f7a68]">
              {items.length} docs · <span className="font-semibold text-[#14352a]">{fmtKg(totalKg)} kg</span>
            </span>
            <button
              onClick={() => onAnular(planilla, "liberar")}
              title="Devolver carga a asignación de vehículos (anula esta planilla)"
              className="rounded-lg border border-[#f0d9b0] bg-[#fdf6e9] px-3 py-1.5 text-xs font-medium text-[#a86a12] transition-colors hover:bg-[#faedd4]"
            >
              Devolver a asignación
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">Cancelar</button>
            <button onClick={handleGuardar} disabled={saving} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#277a42] disabled:opacity-60">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>

      {/* Mini-modal: quitar remisión con opciones */}
      {quitandoItem && (
        <QuitarRemisionModal
          numeroOrden={quitandoItem.numeroOrden}
          remisionKg={Number(quitandoItem.kg) || 0}
          vehiculoActual={planilla.placa}
          vehiculos={vehiculos}
          cargaPorPlaca={cargaPorPlaca}
          devolver={{
            titulo: "Solo quitar del documento",
            descripcion: "La remisión permanece asignada al vehículo.",
            onClick: () => confirmarQuitarItem(quitandoItem),
          }}
          onPasar={(placa) => handlePasarItem(quitandoItem, placa)}
          onClose={() => setQuitandoItem(null)}
        />
      )}
    </div>
  );
}

// ── Modal compartido: quitar remisión (devolver / pasar a otro vehículo) ───────
// Selector de vehículos en cards: verde = cabe, rojo suave = sin capacidad.
function QuitarRemisionModal({
  numeroOrden,
  remisionKg,
  vehiculoActual,
  vehiculos,
  cargaPorPlaca,
  devolver,
  onPasar,
  onClose,
  loading,
}: {
  numeroOrden: string;
  remisionKg: number;
  vehiculoActual: string;
  vehiculos: VehiculoExterno[];
  cargaPorPlaca: Map<string, number>;
  devolver: { titulo: string; descripcion: string; onClick: () => void };
  onPasar: (placa: string) => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const fmtKg = (n: number) =>
    n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const candidatos = vehiculos
    .filter((v) => v.placa.toUpperCase() !== vehiculoActual.toUpperCase())
    .map((v) => {
      const kgActual = cargaPorPlaca.get(v.placa.toUpperCase()) ?? 0;
      const capMax = parseFloat(v.capacidadReal ?? v.capacidad ?? "");
      const tieneCap = Number.isFinite(capMax) && capMax > 0;
      const cabe = !tieneCap || kgActual + remisionKg <= capMax;
      const pctFinal = tieneCap ? Math.round(((kgActual + remisionKg) / capMax) * 100) : 0;
      return { v, kgActual, capMax, tieneCap, cabe, pctFinal };
    })
    .sort((a, b) => Number(b.cabe) - Number(a.cabe) || a.v.placa.localeCompare(b.v.placa));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[#eceef0] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fbeceb] text-[#b3261e]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#14352a]">Quitar remisión</h3>
            <p className="text-xs text-[#7a8794]">Documento: <span className="font-semibold">{numeroOrden}</span> · {fmtKg(remisionKg)} kg</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <button
            onClick={devolver.onClick}
            disabled={loading}
            className="flex w-full items-start gap-3 rounded-lg border border-[#dfe4e0] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f4f6f3] disabled:opacity-60"
          >
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#2f8f4e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>
              <span className="block text-sm font-semibold text-[#14352a]">{devolver.titulo}</span>
              <span className="block text-xs text-[#7a8794]">{devolver.descripcion}</span>
            </span>
          </button>

          <p className="mb-1 mt-4 text-sm font-semibold text-[#14352a]">Pasar a otro vehículo</p>
          <p className="mb-2.5 text-[11px] text-[#7a8794]">
            <span className="font-medium text-[#2f8f4e]">Verde</span>: hay espacio.{" "}
            <span className="font-medium text-[#b3261e]">Rojo</span>: sin capacidad para esta remisión.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {candidatos.map(({ v, kgActual, capMax, tieneCap, cabe, pctFinal }) => (
              <button
                key={v.id}
                disabled={!cabe || loading}
                onClick={() => cabe && onPasar(v.placa)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  cabe
                    ? "border-[#cfe4d6] bg-[#f2f9ef] hover:bg-[#e8f3e2]"
                    : "cursor-not-allowed border-[#f0c4c1] bg-[#fdf2f1]"
                } ${loading ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#14352a]">{v.placa}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cabe ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#fbeceb] text-[#b3261e]"}`}>
                    {cabe ? "Cabe" : "Sin espacio"}
                  </span>
                </div>
                <p className="truncate text-xs text-[#7a8794]">{v.conductor ?? "Sin conductor"}</p>
                {tieneCap ? (
                  <>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#7a8794]">
                      <span>{fmtKg(kgActual)}/{fmtKg(capMax)} kg</span>
                      <span>{pctFinal}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef2ee]">
                      <div className={`h-full ${cabe ? "bg-[#2f8f4e]" : "bg-[#b3261e]"}`} style={{ width: `${Math.min(100, pctFinal)}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="mt-1.5 text-[10px] text-[#7a8794]">Sin capacidad definida</p>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-[#eceef0] px-5 py-3">
          <button onClick={onClose} disabled={loading} className="w-full rounded-lg px-4 py-2 text-sm font-medium text-[#7a8794] transition-colors hover:bg-[#f4f6f3] disabled:opacity-60">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
