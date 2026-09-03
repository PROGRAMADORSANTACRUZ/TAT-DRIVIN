"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  getNovedades,
  getPlanillas,
  getResumen,
  getVehiculosExternos,
  type Novedad,
  type OrdenesResumen,
  type Planilla,
  type VehiculoExterno,
} from "@/lib/api";
import { PageLoader } from "@/components/Loading";

// -"€-"€ Formatters -"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€
const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
const fmtN  = (n: number) => n.toLocaleString("es-CO");

function esHoy(iso: string) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function labelDia(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
}

// -"€-"€ Componentes visuales -"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€-"€

function StatCard({ label, value, sub, color = "#14352a", bg = "bg-white", icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-[#e1e9dd] ${bg} px-4 py-3 shadow-sm`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[#7a8794]">{label}</p>
        <p className="text-3xl font-bold leading-none tabular-nums" style={{ color }}>{value}</p>
        {sub && <p className="truncate text-[11px] text-[#7a8794]">{sub}</p>}
      </div>
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f2f5ef] text-[#7a8794]">
          {icon}
        </span>
      )}
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerSub }: {
  segments: { value: number; color: string; label: string }[];
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const cx = 50, cy = 50, r = 36, sw = 14;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segments.map((seg) => {
    const dl = total > 0 ? (seg.value / total) * circ : 0;
    const a = { ...seg, dashLength: dl, offset: off };
    off += dl;
    return a;
  });
  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f2f5ef" strokeWidth={sw} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.dashLength} ${circ}`}
            strokeDashoffset={-(a.offset - circ / 4)}
            className="transition-all duration-500"
          />
        ))}
        {centerLabel && (
          <>
            <text x="50" y="47" textAnchor="middle" className="fill-[#14352a]" fontSize="14" fontWeight="bold">{centerLabel}</text>
            {centerSub && <text x="50" y="58" textAnchor="middle" className="fill-[#7a8794]" fontSize="6">{centerSub}</text>}
          </>
        )}
      </svg>
    </div>
  );
}

function SparkBars({ data }: { data: { label: string; value: number; kg?: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          {d.value > 0 && <span className="text-[9px] font-semibold text-[#14352a]">{d.value}</span>}
          <div className="w-full overflow-hidden rounded-t-md bg-[#f2f5ef]" style={{ height: "80px" }}>
            <div
              className="w-full rounded-t-md bg-[#2f8f4e] transition-all duration-700"
              title={d.kg ? `${fmtKg(d.kg)} kg` : undefined}
              style={{ height: `${(d.value / max) * 100}%`, marginTop: `${100 - (d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-center text-[9px] text-[#7a8794]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color = "#2f8f4e", sub }: {
  label: string; value: number; max: number; color?: string; sub?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-xs font-medium text-[#45505e]">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-[#14352a]">{sub ?? fmtN(value)}</span>
      </div>
    </div>
  );
}

function RingProgress({ value, max, color = "#2f8f4e", label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#f2f5ef" strokeWidth="8" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className="text-sm font-bold text-[#14352a]">{Math.round(pct)}%</span>
      </div>
      <span className="text-center text-[10px] text-[#7a8794]">{label}</span>
    </div>
  );
}

const ESTADO_COLOR: Record<string, string> = {
  "Pendiente":  "#b5941e",
  "Enviado":    "#1a5fb4",
  "Entregado":  "#2f8f4e",
  "Rechazado":  "#b3261e",
  "Sin Novedad":"#2f8f4e",
  "Con Novedad":"#b3261e",
  "Doc.Pendiente":"#a86a12",
  "Reenvio":    "#4a6fa5",
};

export default function DashboardPage() {
  const [resumen, setResumen] = useState<OrdenesResumen | null>(null);
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, plans, novs, vehs] = await Promise.all([
        getResumen(),
        getPlanillas(),
        getNovedades().catch((err) => { console.error(err); return [] as Novedad[]; }),
        getVehiculosExternos().catch((err) => { console.error(err); return [] as VehiculoExterno[]; }),
      ]);
      setResumen(res);
      setPlanillas(plans);
      setNovedades(novs);
      setVehiculos(vehs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const m = useMemo(() => {
    // Métricas de órdenes agregadas en el backend (evita traer miles de filas).
    const vivas      = resumen?.vivas ?? 0;
    const asignadas  = resumen?.asignadas ?? 0;
    const sinAsig    = resumen?.sinAsig ?? 0;
    const enviadas   = resumen?.enviadas ?? 0;
    const entregadas = resumen?.entregadas ?? 0;
    const rechazadas = resumen?.rechazadas ?? 0;
    const reenviadas = resumen?.reenviadas ?? 0;
    const kilosVivas = resumen?.kilosVivas ?? 0;
    const kilosEnv   = resumen?.kilosEnviadas ?? 0;
    const totalOrdenes = resumen?.totalOrdenes ?? 0;
    const tat  = resumen?.tat ?? 0;
    const agro = resumen?.agro ?? 0;
    const conCarga = resumen?.vehiculosConCarga ?? 0;

    // Planillas
    const planillasHoy    = planillas.filter((p) => esHoy(p.createdAt) && !p.anulada);
    const planillasAnulHoy= planillas.filter((p) => esHoy(p.createdAt) && p.anulada);
    const planillasImprHoy= planillas.filter((p) => esHoy(p.createdAt) && !p.anulada && p.impresa);
    const kilosHoy        = planillasHoy.reduce((s, p) => s + p.kilos, 0);
    const sinImpHoy       = planillasHoy.filter((p) => !p.impresa).length;

    // Últimos 7 días de planillas
    const dias7 = Array.from({ length: 7 }, (_, i) => {
      const fecha = diasAtras(6 - i);
      const ps = planillas.filter((p) => (p.fecha || p.createdAt.slice(0, 10)) === fecha && !p.anulada);
      return { label: labelDia(fecha), value: ps.length, kg: ps.reduce((s, p) => s + p.kilos, 0) };
    });

    // Capacidad por placa (kg) desde la flota externa.
    const capPorPlaca = new Map<string, number>();
    for (const v of vehiculos) {
      const cap = v.capacidadReal ? parseFloat(v.capacidadReal) : v.capacidad ? parseFloat(v.capacidad) : 0;
      if (cap > 0) capPorPlaca.set(v.placa.toUpperCase(), cap);
    }

    // Top vehículos kg hoy
    const porPlaca = new Map<string, { kg: number; docs: number }>();
    for (const p of planillasHoy) {
      const cur = porPlaca.get(p.placa) ?? { kg: 0, docs: 0 };
      cur.kg += p.kilos; cur.docs += p.docs;
      porPlaca.set(p.placa, cur);
    }
    const topPlacas = Array.from(porPlaca.entries())
      .sort((a, b) => b[1].kg - a[1].kg)
      .slice(0, 7)
      .map(([label, v]) => {
        const cap = capPorPlaca.get(label.toUpperCase()) ?? 0;
        const pct = cap > 0 ? Math.round((v.kg / cap) * 100) : 0;
        return { label, value: Math.round(v.kg), cap, pct, sub: cap > 0 ? `${fmtKg(v.kg)} kg · ${pct}%` : `${fmtKg(v.kg)} kg` };
      });

    // Vehículos
    const activos   = vehiculos.filter((v) => v.estado === "Activo");

    // Capacidad total vs cargado
    const capTotal  = activos.reduce((s, v) => s + (v.capacidadReal ? parseFloat(v.capacidadReal) : v.capacidad ? parseFloat(v.capacidad) : 0), 0);
    // Ocupación de flota hoy: kg cargados vs capacidad de los vehículos con planilla.
    const capEnRuta = Array.from(porPlaca.keys()).reduce((s, placa) => s + (capPorPlaca.get(placa.toUpperCase()) ?? 0), 0);
    const pctOcupacion = capEnRuta > 0 ? Math.round((kilosHoy / capEnRuta) * 100) : 0;

    // Novedades
    const novConNov  = novedades.filter((n) => n.estadoEntrega === "Con Novedad").length;
    const novPendDoc = novedades.filter((n) => n.estadoEntrega === "Doc.Pendiente").length;
    const novReenvio = novedades.filter((n) => n.estadoEntrega === "Reenvio").length;
    const novSinNov  = novedades.filter((n) => n.estadoEntrega === "Sin Novedad" || !n.estadoEntrega).length;

    // Top novedades por tipo
    const novPorTipo = new Map<string, number>();
    for (const n of novedades) { if (n.novedad) novPorTipo.set(n.novedad, (novPorTipo.get(n.novedad) ?? 0) + 1); }
    const topNovedades = Array.from(novPorTipo.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top responsabilidades
    const novPorResp = new Map<string, number>();
    for (const n of novedades) { if (n.responsabilidad) novPorResp.set(n.responsabilidad, (novPorResp.get(n.responsabilidad) ?? 0) + 1); }
    const topResp = Array.from(novPorResp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top despachos (placas) con más novedades Con Novedad
    const novPorPlaca = new Map<string, number>();
    for (const n of novedades) {
      if (n.estadoEntrega === "Con Novedad" || n.estadoEntrega === "Rechazado" || n.estadoEntrega === "Parcial Con Novedad") {
        if (n.placa) novPorPlaca.set(n.placa, (novPorPlaca.get(n.placa) ?? 0) + 1);
      }
    }
    const topDespachosNov = Array.from(novPorPlaca.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return {
      // Órdenes
      totalOrdenes, vivas, asignadas,
      sinAsig, enviadas, entregadas,
      rechazadas, reenviadas,
      kilosVivas, kilosEnv,
      pctAsig: vivas > 0 ? Math.round((asignadas / vivas) * 100) : 0,
      // Planillas
      planillasHoy: planillasHoy.length, planillasAnulHoy: planillasAnulHoy.length,
      planillasImprHoy: planillasImprHoy.length, sinImpHoy, kilosHoy,
      dias7,
      // Distribución
      tat, agro,
      // Vehículos
      activos: activos.length, conCarga, capTotal,
      capEnRuta, pctOcupacion,
      topPlacas,
      // Novedades
      novConNov, novPendDoc, novReenvio, novSinNov,
      topNovedades, topResp, topDespachosNov,
      totalNovedades: novedades.length,
    };
  }, [resumen, planillas, novedades, vehiculos]);

  return (
    <div className="flex h-full flex-col overflow-auto p-3 sm:p-4">
      <header className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Dashboard</h1>
          <p className="text-sm text-[#5f7a68]">Resumen operativo en tiempo real · Santa Cruz</p>
        </div>
        <button onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
          </svg>
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>}

      {loading ? (
        <div className="flex flex-1"><PageLoader /></div>
      ) : (
        <div className="flex flex-col gap-2.5">

          {/* Row 1: KPIs principales */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Órdenes activas" value={fmtN(m.vivas)} sub={`${fmtKg(m.kilosVivas)} kg total`}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
            <StatCard label="Sin asignar" value={fmtN(m.sinAsig)} sub="pendientes de vehículo"
              color={m.sinAsig > 0 ? "#a86a12" : "#2f8f4e"}
              bg={m.sinAsig > 0 ? "bg-[#fdf6e9]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
            <StatCard label="Planillas hoy" value={fmtN(m.planillasHoy)} sub={`${fmtKg(m.kilosHoy)} kg despachados`}
              color="#2f8f4e"
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} />
            <StatCard label="Con novedad" value={fmtN(m.novConNov)} sub={`${m.novPendDoc} doc.pendiente · ${m.novReenvio} reenvío`}
              color={m.novConNov > 0 ? "#b3261e" : "#2f8f4e"}
              bg={m.novConNov > 0 ? "bg-[#fbeceb]" : "bg-white"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
            <StatCard label="Sin imprimir" value={fmtN(m.sinImpHoy)} sub={`${m.planillasImprHoy} impresas · ${m.planillasAnulHoy} anuladas`}
              color={m.sinImpHoy > 0 ? "#a86a12" : "#2f8f4e"}
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>} />
          </div>

          {/* Fila 0: Accesos rápidos (botones pill debajo de los KPIs) */}
          <div className="nice-scroll flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {[
              { href: "/asignacion-vehiculos", label: "Asignación de órdenes", sub: `${m.sinAsig} sin asignar`, color: "bg-[#f7faf5]" },
              { href: "/planificacion-dl", label: "Planificación D.L.", sub: `${m.sinImpHoy} sin imprimir hoy`, color: "bg-[#f7faf5]" },
              { href: "/nivel-de-servicio", label: "Nivel de servicio", sub: `${m.novConNov} con novedad`, color: m.novConNov > 0 ? "bg-[#fbeceb]" : "bg-[#f7faf5]" },
              { href: "/planes", label: "Diagrama", sub: `${m.conCarga} vehículos en ruta`, color: "bg-[#f7faf5]" },
              { href: "/ordenes", label: "Cargar órdenes", sub: `${m.totalOrdenes} en el sistema`, color: "bg-[#f7faf5]" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#e1e9dd] ${item.color} px-4 py-2 transition-all hover:border-[#2f8f4e] hover:shadow-sm lg:flex-1`}>
                <span className="whitespace-nowrap text-xs font-semibold text-[#14352a]">{item.label}</span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[#7a8794]">{item.sub}</span>
              </Link>
            ))}
          </div>

          {/* Fila 1: Nivel de servicio · Despachos con más novedades · Responsabilidades */}
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">

            {/* Nivel de servicio */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Nivel de servicio</h2>
                <Link href="/nivel-de-servicio" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver detalle →</Link>
              </div>
              {m.totalNovedades === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <>
                  <div className="mb-4 flex justify-around">
                    {[
                      { l: "Sin nov.", v: m.novSinNov, c: "#2f8f4e" },
                      { l: "Con nov.", v: m.novConNov, c: "#b3261e" },
                      { l: "Doc.Pend.", v: m.novPendDoc, c: "#a86a12" },
                      { l: "Reenvío", v: m.novReenvio, c: "#4a6fa5" },
                    ].map((x) => (
                      <div key={x.l} className="flex flex-col items-center gap-0.5">
                        <span className="text-xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</span>
                        <span className="text-[10px] text-[#7a8794]">{x.l}</span>
                      </div>
                    ))}
                  </div>
                  {m.topNovedades.length > 0 && (
                    <>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7a8794]">Tipos frecuentes</p>
                      <div className="flex flex-col gap-1.5">
                        {m.topNovedades.slice(0, 4).map(([label, value]) => (
                          <HBar key={label} label={label} value={value} max={m.topNovedades[0][1]} color="#b3261e" />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Despachos con más novedades */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Despachos con más novedades</h2>
                <Link href="/nivel-de-servicio" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver →</Link>
              </div>
              {m.topDespachosNov.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topDespachosNov.map(([label, value]) => (
                    <HBar key={label} label={label} value={value} max={m.topDespachosNov[0][1]} color="#b3261e" />
                  ))}
                </div>
              )}
            </div>

            {/* Responsabilidades de novedades */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Responsabilidades de novedades</h2>
              {m.topResp.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#7a8794]">Sin registros</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topResp.map(([label, value]) => (
                    <HBar key={label} label={label} value={value} max={m.topResp[0][1]} color="#a86a12" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fila 2: Distribución · Estado de órdenes · Plantillas últimos 7 días */}
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">

            {/* Distribución TAT vs Agropecuaria */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Distribución de carga activa</h2>
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <DonutChart
                    centerLabel={fmtN(m.vivas)}
                    centerSub="total"
                    segments={[
                      { label: "TAT", value: m.tat, color: "#4a6fa5" },
                      { label: "Agropecuaria", value: m.agro, color: "#2f8f4e" },
                    ].filter((s) => s.value > 0)}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { l: "TAT", v: m.tat, c: "#4a6fa5" },
                    { l: "Agropecuaria", v: m.agro, c: "#2f8f4e" },
                  ].map((x) => (
                    <div key={x.l}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
                          <span className="text-[#5f7a68]">{x.l}</span>
                        </div>
                        <span className="font-bold tabular-nums text-[#14352a]">{fmtN(x.v)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f2f5ef]">
                        <div className="h-full rounded-full" style={{ width: `${m.vivas > 0 ? (x.v / m.vivas) * 100 : 0}%`, background: x.c }} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 rounded-lg bg-[#f7faf5] px-3 py-2 text-xs text-[#5f7a68]">
                    <p><span className="font-semibold text-[#14352a]">{fmtKg(m.kilosEnv)}</span> kg en tránsito a Drivin</p>
                    <p><span className="font-semibold text-[#14352a]">{m.totalOrdenes}</span> órdenes totales en el sistema</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Donut — Estado de órdenes */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Estado de órdenes</h2>
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <DonutChart
                    centerLabel={fmtN(m.vivas)}
                    centerSub="activas"
                    segments={[
                      { label: "Sin asignar", value: m.sinAsig, color: "#f0d9b0" },
                      { label: "Asignadas", value: m.asignadas - m.enviadas, color: "#b5941e" },
                      { label: "Enviadas", value: m.enviadas, color: "#1a5fb4" },
                      { label: "Entregadas", value: m.entregadas, color: "#2f8f4e" },
                      { label: "Rechazadas", value: m.rechazadas, color: "#b3261e" },
                    ].filter((s) => s.value > 0)}
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  {[
                    { l: "Sin asignar", v: m.sinAsig, c: "#f0d9b0" },
                    { l: "Asignadas", v: m.asignadas - m.enviadas, c: "#b5941e" },
                    { l: "Enviadas", v: m.enviadas, c: "#1a5fb4" },
                    { l: "Entregadas", v: m.entregadas, c: "#2f8f4e" },
                    { l: "Rechazadas", v: m.rechazadas, c: "#b3261e" },
                  ].map((x) => (
                    <div key={x.l} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: x.c }} />
                      <span className="text-[#5f7a68]">{x.l}</span>
                      <span className="ml-auto font-semibold tabular-nums text-[#14352a]">{fmtN(x.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Barras verticales — últimos 7 días */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Planillas últimos 7 días</h2>
                <span className="text-xs text-[#7a8794]">total: {m.dias7.reduce((s, d) => s + d.value, 0)}</span>
              </div>
              <SparkBars data={m.dias7} />
            </div>
          </div>

          {/* Fila 3: Vehículos y capacidad · Top vehículos (% carga) · Ocupación de flota */}
          <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-3">

            {/* Rings — capacidad y asignación */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-[#14352a]">Vehículos y capacidad</h2>
              <div className="flex justify-around">
                <RingProgress value={m.conCarga} max={m.activos} color="#2f8f4e" label={`${m.conCarga}/${m.activos} en ruta`} />
                <RingProgress value={m.asignadas} max={m.vivas} color="#1a5fb4" label={`${m.pctAsig}% asignado`} />
                <RingProgress value={m.planillasImprHoy} max={m.planillasHoy} color="#b5941e" label={`${m.planillasHoy > 0 ? Math.round((m.planillasImprHoy / m.planillasHoy) * 100) : 0}% impresas`} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                <div><p className="text-lg font-bold text-[#14352a]">{m.activos}</p><p>vehículos</p></div>
                <div><p className="text-lg font-bold text-[#14352a]">{m.reenviadas}</p><p>reenviadas</p></div>
                <div><p className="text-lg font-bold text-[#14352a]">{m.rechazadas}</p><p>rechazadas</p></div>
              </div>
            </div>

            {/* Top vehículos hoy con % de carga */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Top vehículos hoy (% carga)</h2>
                <Link href="/planificacion-dl" className="text-[10px] font-medium text-[#2f8f4e] hover:underline">Ver planillas →</Link>
              </div>
              {m.topPlacas.length === 0 ? (
                <p className="text-sm text-[#7a8794]">Sin planillas hoy.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {m.topPlacas.map((d) => {
                    const barColor = d.pct >= 90 ? "#b3261e" : d.pct >= 70 ? "#a86a12" : "#2f8f4e";
                    const width = d.cap > 0 ? Math.min(100, d.pct) : (d.value / m.topPlacas[0].value) * 100;
                    return (
                      <div key={d.label} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 truncate text-xs font-medium text-[#45505e]">{d.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f2f5ef]">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, background: barColor }} />
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-semibold tabular-nums text-[#14352a]">{fmtKg(d.value)}</span>
                          {d.cap > 0 && <span className="ml-1 text-[10px] font-semibold" style={{ color: barColor }}>{d.pct}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ocupación de flota hoy (kg cargados vs capacidad) */}
            <div className="rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#14352a]">Ocupación de flota hoy</h2>
                <span className="text-[10px] text-[#7a8794]">{m.conCarga} en ruta</span>
              </div>
              {m.capEnRuta === 0 ? (
                <div className="flex h-24 items-center justify-center text-center text-sm text-[#7a8794]">Sin capacidad registrada para los vehículos en ruta.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums" style={{ color: m.pctOcupacion >= 90 ? "#b3261e" : m.pctOcupacion >= 70 ? "#a86a12" : "#2f8f4e" }}>{m.pctOcupacion}%</span>
                    <span className="text-xs text-[#7a8794]">capacidad utilizada</span>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-[#f2f5ef]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, m.pctOcupacion)}%`, background: m.pctOcupacion >= 90 ? "#b3261e" : m.pctOcupacion >= 70 ? "#a86a12" : "#2f8f4e" }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#7a8794]">
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(m.kilosHoy)}</p><p>kg cargados</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(m.capEnRuta)}</p><p>kg capacidad</p></div>
                    <div><p className="text-sm font-bold text-[#14352a]">{fmtKg(Math.max(0, m.capEnRuta - m.kilosHoy))}</p><p>kg disponible</p></div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
