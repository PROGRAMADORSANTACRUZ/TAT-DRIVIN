"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tc, btn } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import ClienteFormModal from "@/components/cliente/ClienteFormModal";
import FacturaScanModal from "@/components/ordenes/FacturaScanModal";
import {
  ApiError,
  asignarConsecutivo,
  asignarConsecutivoTat,
  cruzarConsecutivosAuto,
  deleteOrdenes,
  eliminarOrdenesPorIds,
  getClientes,
  getClientesTat,
  getOrdenes,
  importOrdenes,
  verificarClientesOrdenes,
  type Cliente,
  type ClienteSinRegistrar,
  type ClienteTat,
  type Orden,
  type VerificacionClientes,
} from "@/lib/api";

function fechaISO(f: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Clave normalizada para cruzar con la verificación (cliente||destino).
function claveCD(cliente: string, destino: string): string {
  const n = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  return `${n(cliente)}||${n(destino)}`;
}

type OrdenGrupo = {
  key: string;
  numeroOrden: string;
  fecha: string;
  cliente: string;
  destino: string;
  estado: string;
  reenviado: boolean;
  reenviadoAt: string | null;
  items: Orden[];
  totalKg: number;
  nit: string | null;
  codigo: string | null;
  totalValor: number;
  distribucion: string;
  tatOrigen: string | null;
  direccion: string | null;
  vendedor: string | null;
  sobrescritoConcatenado: boolean;
  clienteOriginal: string | null;
  clienteAsignado: string | null;
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
        estado: o.estado,
        reenviado: false,
        reenviadoAt: null,
        items: [],
        totalKg: 0,
        nit: o.nit ?? null,
        codigo: o.codigo ?? null,
        totalValor: 0,
        distribucion: o.distribucion,
        tatOrigen: o.tatOrigen ?? null,
        direccion: o.direccion ?? null,
        vendedor: o.vendedor ?? null,
        sobrescritoConcatenado: !!o.sobrescritoConcatenado,
        clienteOriginal: o.clienteOriginal ?? null,
        clienteAsignado: o.clienteAsignado ?? null,
      };
      map.set(key, g);
    }
    g.items.push(o);
    g.totalKg += o.cantidadKg;
    g.totalValor += o.valor ?? 0;
    if (!g.direccion && o.direccion) g.direccion = o.direccion;
    if (!g.vendedor && o.vendedor) g.vendedor = o.vendedor;
    if (o.reenviado) {
      g.reenviado = true;
      if (o.reenviadoAt) g.reenviadoAt = o.reenviadoAt;
    }
  }
  return Array.from(map.values());
}

function consolidarProductos(items: Orden[]) {
  const map = new Map<string, { producto: string; cantidadKg: number; lineas: number }>();
  for (const it of items) {
    const k = it.producto || "—";
    let p = map.get(k);
    if (!p) {
      p = { producto: k, cantidadKg: 0, lineas: 0 };
      map.set(k, p);
    }
    p.cantidadKg += it.cantidadKg;
    p.lineas += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.cantidadKg - a.cantidadKg);
}

// Formatea un valor en pesos colombianos sin decimales.
const fmtMoney = (n: number) =>
  `$${(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

// Limpia una dirección: descarta vacíos y placeholders tipo "N/a".
const dirLimpia = (d: string | null | undefined): string => {
  const s = String(d ?? "").trim();
  return s && !/^n\/?a$/i.test(s) ? s : "";
};

// Convierte un grupo de orden al formato que usan los modales de asignar/crear/eliminar.
function grupoAClienteSinReg(g: OrdenGrupo): ClienteSinRegistrar {
  return {
    // El consecutivo se arma con el cliente original del Excel, no con el
    // nombre ya sobrescrito, para que la reasignación quede estable.
    cliente: g.clienteOriginal ?? g.cliente,
    destino: g.destino,
    nit: g.nit,
    codigo: g.codigo,
    direccion: g.direccion,
    distribucion: g.distribucion,
    pedidos: 1,
    numeros: [g.numeroOrden],
    ids: g.items.map((it) => it.id),
  };
}

type CategoryId = "BOVINO" | "PORCINO" | "TAT" | "INVERSIONES";

const CATEGORIES = [
  {
    id: "BOVINO" as CategoryId,
    label: "Bovino",
    letter: "B",
    color: "#2f8f4e",
    bg: "#e8f3e2",
    borderColor: "#a8d5b5",
    tipo: "B" as "B" | "P" | "I",
    isTat: false,
    syncOrigen: null as "AGROPECUARIA" | "INVERSIONES" | null,
  },
  {
    id: "PORCINO" as CategoryId,
    label: "Porcino",
    letter: "P",
    color: "#b5731e",
    bg: "#fef3e6",
    borderColor: "#f0c890",
    tipo: "P" as "B" | "P" | "I",
    isTat: false,
    syncOrigen: null as "AGROPECUARIA" | "INVERSIONES" | null,
  },
  {
    id: "TAT" as CategoryId,
    label: "TAT Agropecuaria",
    letter: "T",
    color: "#7c3aed",
    bg: "#f3f0ff",
    borderColor: "#c4b5fd",
    tipo: null as null,
    isTat: true,
    syncOrigen: "AGROPECUARIA" as "AGROPECUARIA" | "INVERSIONES" | null,
  },
  {
    id: "INVERSIONES" as CategoryId,
    label: "TAT Inversiones",
    letter: "I",
    color: "#1a5fb4",
    bg: "#e6effb",
    borderColor: "#93c5fd",
    tipo: null as null,
    isTat: true,
    syncOrigen: "INVERSIONES" as "AGROPECUARIA" | "INVERSIONES" | null,
  },
];

// Tipo de borrado por card (respeta el origen TAT: Agropecuaria vs Inversiones).
function catDeleteTipo(cat: (typeof CATEGORIES)[number]): "B" | "P" | "I" | "TATAGRO" | "TATINV" {
  if (!cat.isTat) return cat.tipo as "B" | "P" | "I";
  return cat.syncOrigen === "INVERSIONES" ? "TATINV" : "TATAGRO";
}

function getOrdenesForCategory(ordenes: Orden[], cat: CategoryId): Orden[] {
  switch (cat) {
    case "BOVINO":
      return ordenes.filter(
        (o) => o.distribucion === "AGROPECUARIA" && o.numeroOrden?.startsWith("B")
      );
    case "PORCINO":
      return ordenes.filter(
        (o) => o.distribucion === "AGROPECUARIA" && o.numeroOrden?.startsWith("P")
      );
    case "TAT":
      return ordenes.filter(
        (o) => o.distribucion === "TAT" && o.tatOrigen !== "INVERSIONES"
      );
    case "INVERSIONES":
      return ordenes.filter(
        (o) => o.distribucion === "TAT" && o.tatOrigen === "INVERSIONES"
      );
  }
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const IconTrash = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconUpload = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconScan = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v.01M14 20v.01M20 20v.01M17 17h.01"/>
  </svg>
);
const IconSpin = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
  </svg>
);
const IconClose = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconPencil = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconLink = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const IconPlus = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function OrdenesPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncingTat, setSyncingTat] = useState(false);
  const [eliminarModalOpen, setEliminarModalOpen] = useState(false);
  const [borrarCard, setBorrarCard] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [search, setSearch] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [detalle, setDetalle] = useState<OrdenGrupo | null>(null);
  const [verif, setVerif] = useState<VerificacionClientes | null>(null);
  const [verifModalOpen, setVerifModalOpen] = useState(false);
  const [buscarVerif, setBuscarVerif] = useState("");
  const [clientesDb, setClientesDb] = useState<Cliente[]>([]);
  const [clientesTatDb, setClientesTatDb] = useState<ClienteTat[]>([]);
  const [editGsTarget, setEditGsTarget] = useState<Cliente | null>(null);
  const [editTatTarget, setEditTatTarget] = useState<ClienteTat | null>(null);
  const [asignarTarget, setAsignarTarget] = useState<ClienteSinRegistrar | null>(null);
  const [crearTarget, setCrearTarget] = useState<ClienteSinRegistrar | null>(null);
  const [eliminarSinRegTarget, setEliminarSinRegTarget] = useState<ClienteSinRegistrar | null>(null);
  const [eliminandoSinReg, setEliminandoSinReg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<"B" | "P" | "I" | null>(null);
  const [scanOrigen, setScanOrigen] = useState<"AGROPECUARIA" | "INVERSIONES" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrdenes(await getOrdenes());
      verificarClientesOrdenes()
        .then(setVerif)
        .catch(() => setVerif(null));
      getClientes()
        .then(setClientesDb)
        .catch(() => setClientesDb([]));
      getClientesTat()
        .then(setClientesTatDb)
        .catch(() => setClientesTatDb([]));
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
    e.target.value = ""; // permite volver a importar el mismo archivo
    const tipo = tipoRef.current;
    tipoRef.current = null;
    if (!file || !tipo) return;

    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const { importados, entregados, rechazados, pendientes, sinCodigo } =
        await importOrdenes(file, tipo);
      setMessage(
        `Se importaron ${importados}: ${entregados} entregadas, ${rechazados} rechazadas, ${pendientes} pendientes.` +
          (sinCodigo ? ` ${sinCodigo} ${sinCodigo === 1 ? "orden quedó" : "órdenes quedaron"} sin código (regístralas en la verificación de clientes).` : "")
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  }

  function triggerImport(tipo: "B" | "P" | "I") {
    tipoRef.current = tipo;
    fileInputRef.current?.click();
  }

  async function handleDelete(tipo?: "B" | "P" | "I" | "AGRO" | "TAT" | "TATAGRO" | "TATINV") {
    setEliminarModalOpen(false);
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const { eliminados } = await deleteOrdenes(tipo);
      const label =
        tipo === "B" ? "Bovino" :
        tipo === "P" ? "Porcino" :
        tipo === "I" ? "Inversiones" :
        tipo === "TATAGRO" ? "TAT Agropecuaria" :
        tipo === "TATINV" ? "TAT Inversiones" :
        tipo === "TAT" ? "facturas TAT" : "todas";
      setMessage(`Se eliminaron ${eliminados} órdenes${tipo ? ` (${label})` : ""}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  function openCategory(cat: CategoryId) {
    setActiveCategory(cat);
    setSearch("");
    setClienteFiltro("");
    setDesde("");
    setHasta("");
  }

  function closeCategory() {
    setActiveCategory(null);
    setEliminarModalOpen(false);
  }

  // ── Datos derivados de la categoría activa ──────────────────────────────
  const activeCat = CATEGORIES.find((c) => c.id === activeCategory) ?? null;
  const activeCatOrdenes = activeCategory
    ? getOrdenesForCategory(ordenes, activeCategory)
    : [];
  const clientesUnicos = Array.from(
    new Set(activeCatOrdenes.map((o) => o.cliente).filter(Boolean))
  ).sort();
  const term = search.trim().toLowerCase();

  const filteredPendientes = activeCatOrdenes.filter((o) => {
    if (o.estado === "Entregado" || o.estado === "Rechazado") return false;
    if (
      term &&
      ![o.numeroOrden, o.cliente, o.destino, o.producto, o.fecha].some((f) =>
        f?.toLowerCase().includes(term)
      )
    )
      return false;
    if (clienteFiltro && o.cliente !== clienteFiltro) return false;
    const iso = fechaISO(o.fecha);
    if (desde && iso && iso < desde) return false;
    if (hasta && iso && iso > hasta) return false;
    return true;
  });

  const pendientesGrupos = agrupar(filteredPendientes);

  // Código del cliente relacionado (BD/Drivin) por consecutivo cliente||destino.
  const codigoPorClave = new Map<string, string>();
  if (verif) {
    for (const r of verif.registrados) {
      if (r.codigo) codigoPorClave.set(claveCD(r.cliente, r.destino), r.codigo);
    }
  }

  async function handleAsignar(tipo: "GS" | "TAT", clienteId: string) {
    if (!asignarTarget) return;
    // TAT: el concatenado es el NIT-sucursal (ruteo por NIT, prioridad sobre el Excel).
    const consecutivo =
      asignarTarget.distribucion === "TAT" && asignarTarget.nit
        ? asignarTarget.nit
        : `${asignarTarget.cliente} - ${asignarTarget.destino}`;
    try {
      if (tipo === "TAT") await asignarConsecutivoTat(clienteId, consecutivo);
      else await asignarConsecutivo(clienteId, consecutivo);
      setMessage(`Consecutivo asignado. Actualizando verificación…`);
      setAsignarTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al asignar");
    }
  }

  // Abre el cliente existente para editar; si no está en la DB, ofrece crearlo.
  function abrirEditar(g: OrdenGrupo) {
    if (g.distribucion === "TAT") {
      const found = clientesTatDb.find((c) => {
        if (!c.nit) return false;
        const suc = parseInt(String(c.sucursal ?? ""), 10);
        const clave = Number.isFinite(suc) ? `${c.nit}-${suc}` : c.nit;
        return clave === g.nit || c.nit === g.nit;
      });
      if (found) { setEditTatTarget(found); return; }
    } else {
      // Busca el cliente GS por código resuelto, código de la orden o por nombre:
      // si existe, se abre en modo editar; si no, se ofrece crearlo.
      const cod =
        codigoPorClave.get(claveCD(g.clienteAsignado ?? g.cliente, g.destino)) ??
        codigoPorClave.get(claveCD(g.cliente, g.destino)) ??
        g.codigo ??
        undefined;
      const nombreClave = claveCD(g.clienteAsignado ?? g.cliente, "");
      const found = clientesDb.find(
        (c) =>
          (!!cod && c.codigoDireccion === cod) ||
          claveCD(c.cliente ?? "", "") === nombreClave ||
          claveCD(c.nombreDireccion ?? "", "") === nombreClave
      );
      if (found) { setEditGsTarget(found); return; }
    }
    setCrearTarget(grupoAClienteSinReg(g));
  }

  async function handleEliminarSinRegistrar(c: ClienteSinRegistrar) {
    if (!c.ids || c.ids.length === 0) return;
    setEliminandoSinReg(true);
    try {
      const { eliminados } = await eliminarOrdenesPorIds(c.ids);
      setMessage(`Se eliminaron ${eliminados} órdenes de ${tc(c.cliente)}.`);
      setEliminarSinRegTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar");
    } finally {
      setEliminandoSinReg(false);
    }
  }

  const [cruzando, setCruzando] = useState(false);
  async function handleCruzarAuto() {
    setCruzando(true);
    setError(null);
    try {
      const { asignados, clientesAfectados } = await cruzarConsecutivosAuto();
      setMessage(
        `Cruce automático: ${asignados} consecutivos asignados a ${clientesAfectados} clientes.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cruzar");
    } finally {
      setCruzando(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14352a]">Cargar Órdenes</h1>
          <p className="text-sm text-[#5f7a68]">
            Importa el informe y consulta las órdenes despachadas.
          </p>
        </div>

        {verif && (
          verif.sinRegistrar.length > 0 ? (
            <button
              onClick={() => {
                setBuscarVerif("");
                setVerifModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[#f3d19b] bg-[#fdf6e9] px-4 py-2.5 text-sm font-medium text-[#a86a12] transition-colors hover:bg-[#faedd4]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                <span className="font-bold">{verif.sinRegistrar.length}</span>{" "}
                {verif.sinRegistrar.length === 1 ? "cliente sin registrar" : "clientes sin registrar"} en Drivin
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-[#cfe4d6] bg-[#eef7ea] px-4 py-2.5 text-sm font-medium text-[#2f8f4e]">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Todos los clientes verificados
            </span>
          )
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFile}
      />

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">
          {message}
        </div>
      )}
      {error && !activeCategory && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">
          {error}
        </div>
      )}

      {/* ── Tarjetas por categoría ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-[#5f7a68]">Cargando…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 pb-8 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const catOrdenes = getOrdenesForCategory(ordenes, cat.id);
            const catPendientes = catOrdenes.filter(
              (o) => o.estado !== "Entregado" && o.estado !== "Rechazado"
            );
            const catPendientesGrupos = agrupar(catPendientes);
            const catTotalKg = catPendientes.reduce((s, o) => s + o.cantidadKg, 0);
            const hasAny = catOrdenes.length > 0;
            const hasPendientes = catPendientes.length > 0;
            const cardColor = "#2f8f4e";
            const cardBg = "#e8f3e2";

            return (
              <div
                key={cat.id}
                onClick={() => (hasAny ? openCategory(cat.id) : undefined)}
                className={`group relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border transition-all ${
                  hasAny
                    ? "cursor-pointer border-[#e1e9dd] bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg"
                    : "border-dashed border-[#d4dccf] bg-[#fafcf8]"
                }`}
              >
                {/* Franja superior de color */}
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: hasAny
                      ? `linear-gradient(90deg, ${cardColor}, ${cardColor}99)`
                      : "#e2e8dc",
                  }}
                />

                <div className="flex flex-1 flex-col gap-5 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow-sm ring-1 ring-inset ring-black/5"
                        style={{ backgroundColor: cardBg, color: cardColor }}
                      >
                        {cat.letter}
                      </span>
                      <div>
                        <p className="font-semibold text-[#14352a]">{cat.label}</p>
                        <p className="text-xs text-[#7a8794]">
                          {cat.isTat ? "Distribución TAT" : "Distribución Agropecuaria"}
                        </p>
                      </div>
                    </div>
                    {hasAny && hasPendientes && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8f3e2] px-2.5 py-1 text-xs font-medium text-[#2f8f4e]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2f8f4e]" />
                        Cargado
                      </span>
                    )}
                    {hasAny && !hasPendientes && (
                      <span className="flex shrink-0 items-center rounded-full bg-[#f0f2ee] px-2.5 py-1 text-xs font-medium text-[#7a8794]">
                        Completado
                      </span>
                    )}
                    {!hasAny && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#fbf3e6] px-2.5 py-1 text-xs font-medium text-[#b5731e]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#e0a340]" />
                        Sin cargar
                      </span>
                    )}
                  </div>

                  {hasAny ? (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-end gap-2">
                          <p className="text-5xl font-bold leading-none tracking-tight text-[#14352a]">
                            {catPendientesGrupos.length}
                          </p>
                          <p className="mb-1 text-sm text-[#5f7a68]">
                            {catPendientesGrupos.length === 1 ? "cargado" : "cargados"}
                          </p>
                        </div>

                        {catTotalKg > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-[#7a8794]">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 7h-9M14 17H5M17 3l4 4-4 4M7 21l-4-4 4-4" />
                            </svg>
                            {catTotalKg.toLocaleString("es-CO", { maximumFractionDigits: 0 })} kg por despachar
                          </div>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between border-t border-[#f0f2ee] pt-4">
                        <span
                          className="flex items-center gap-1 text-sm font-semibold transition-transform group-hover:translate-x-0.5"
                          style={{ color: cardColor }}
                        >
                          Ver órdenes
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBorrarCard(cat);
                            }}
                            disabled={deleting}
                            title="Eliminar órdenes de esta card"
                            aria-label="Eliminar órdenes"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e] transition-colors hover:bg-[#f7dcda] disabled:opacity-60"
                          >
                            <IconTrash />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cat.isTat && cat.syncOrigen) setScanOrigen(cat.syncOrigen);
                              else if (cat.tipo) triggerImport(cat.tipo);
                            }}
                            disabled={importing}
                            className="rounded-lg border border-[#e1e9dd] px-3.5 py-2 text-xs font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
                          >
                            {cat.isTat ? "Leer factura" : "Importar"}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f5ef] text-[#b8c2b0]">
                          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <path d="M3 10h18M8 4v4M16 4v4" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[#7a8794]">
                            Sin plan cargado
                          </p>
                          <p className="mt-0.5 text-xs text-[#a6b0a9]">
                            No se ha montado el plan de hoy
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cat.isTat && cat.syncOrigen) setScanOrigen(cat.syncOrigen);
                          else if (cat.tipo) triggerImport(cat.tipo);
                        }}
                        disabled={importing}
                        className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        style={{ backgroundColor: cardColor }}
                      >
                        {importing ? (
                          <IconSpin />
                        ) : cat.isTat ? (
                          <IconScan />
                        ) : (
                          <IconUpload />
                        )}
                        {cat.isTat ? "Leer factura" : "Montar plan"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Cards en desarrollo (deshabilitadas) */}
          {[
            { label: "Subproductos Bovinos", letter: "SB" },
            { label: "Subproductos Porcinos", letter: "SP" },
          ].map((sub) => (
            <div
              key={sub.label}
              aria-disabled
              className="relative flex min-h-[300px] cursor-not-allowed select-none flex-col overflow-hidden rounded-2xl border border-dashed border-[#d4dccf] bg-[#fafcf8] opacity-70"
            >
              <div className="h-1.5 w-full bg-[#e2e8dc]" />
              <div className="flex flex-1 flex-col gap-5 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ea] text-sm font-bold text-[#9aa8a0] ring-1 ring-inset ring-black/5">
                      {sub.letter}
                    </span>
                    <div>
                      <p className="font-semibold text-[#6b7a70]">{sub.label}</p>
                      <p className="text-xs text-[#a6b0a9]">Distribución Agropecuaria</p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#f0f2ee] px-2.5 py-1 text-xs font-medium text-[#8a968d]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c0c9bf]" />
                    Pendiente
                  </span>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f5ef] text-[#c0c9bf]">
                    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[#8a968d]">Próximamente</p>
                    <p className="mt-0.5 text-xs text-[#a6b0a9]">Módulo en desarrollo</p>
                  </div>
                </div>
                <button
                  disabled
                  className="mt-auto flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-[#d4dccf] py-2.5 text-sm font-semibold text-[#a6b0a9]"
                >
                  No disponible
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de categoría ── */}
      {activeCategory && activeCat && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 sm:p-6"
        >
          <div
            className="flex max-h-[92vh] w-[99vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-1.5 w-full shrink-0"
              style={{ background: `linear-gradient(90deg, ${activeCat.color}, ${activeCat.color}99)` }}
            />
            <div className="flex shrink-0 items-center gap-2.5 border-b border-[#eceef0] px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-bold ring-1 ring-inset ring-black/5 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-lg"
                style={{ backgroundColor: activeCat.bg, color: activeCat.color }}
              >
                {activeCat.letter}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h2 className="truncate text-base font-semibold text-[#14352a] sm:text-lg">{activeCat.label}</h2>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-[#f0f2ee] px-2 py-0.5 text-xs font-medium text-[#5f7a68]">
                    {pendientesGrupos.length} pendientes
                  </span>
                </div>
                <p className="text-xs text-[#7a8794]">
                  {activeCat.isTat ? "Distribución TAT" : "Distribución Agropecuaria"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {activeCatOrdenes.length > 0 && (
                  <button
                    onClick={() => setEliminarModalOpen(true)}
                    disabled={deleting}
                    className={btn}
                  >
                    <IconTrash />
                    <span className="hidden sm:inline">{deleting ? "Eliminando…" : "Eliminar"}</span>
                  </button>
                )}
                {activeCat.isTat ? (
                  <button
                    onClick={() => activeCat.syncOrigen && setScanOrigen(activeCat.syncOrigen)}
                    className={btn}
                  >
                    <IconScan />
                    <span className="hidden sm:inline">Leer factura</span>
                  </button>
                ) : (
                  <button
                    onClick={() => activeCat.tipo && triggerImport(activeCat.tipo)}
                    disabled={importing}
                    className={btn}
                  >
                    {importing ? <IconSpin /> : <IconUpload />}
                    <span className="hidden sm:inline">{importing ? "Importando…" : "Importar"}</span>
                  </button>
                )}
                <button
                  onClick={closeCategory}
                  aria-label="Cerrar"
                  className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3] hover:text-[#45505e]"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 shrink-0 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">
                {error}
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-[#eceef0] px-4 py-4 sm:px-6">
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <span className="text-xs font-medium text-[#7a8794]">Buscar</span>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Orden, destino, producto…"
                  className="w-full sm:w-64"
                />
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <span className="text-xs font-medium text-[#7a8794]">Cliente</span>
                <select
                  value={clienteFiltro}
                  onChange={(e) => setClienteFiltro(e.target.value)}
                  className="w-full rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20 sm:w-52"
                >
                  <option value="">Todos</option>
                  {clientesUnicos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Desde</span>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#7a8794]">Hasta</span>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
                />
              </div>
              {(search || clienteFiltro || desde || hasta) && (
                <button
                  onClick={() => {
                    setSearch("");
                    setClienteFiltro("");
                    setDesde("");
                    setHasta("");
                  }}
                  className="rounded-lg border border-[#dfe4e0] px-3 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {pendientesGrupos.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                  <p className="text-sm text-[#5f7a68]">
                    No hay órdenes pendientes.{" "}
                    {activeCat.isTat ? "Sincroniza TAT" : "Importa el informe"} para
                    cargarlas.
                  </p>
                </div>
              ) : (
                <div className="nice-scroll min-h-0 flex-1 overflow-auto">
                  <table className="w-full table-auto text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                      {activeCat.isTat ? (
                        <tr>
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Fecha</th>
                          <th className="px-4 py-3 font-semibold">No. Orden</th>
                          <th className="px-4 py-3 font-semibold">NIT</th>
                          <th className="px-4 py-3 font-semibold">Cliente</th>
                          <th className="px-4 py-3 font-semibold">Dirección</th>
                          <th className="px-4 py-3 text-right font-semibold">Ítems</th>
                          <th className="px-4 py-3 text-right font-semibold">Total (kg)</th>
                          <th className="px-4 py-3 text-right font-semibold">Total valor</th>
                          <th className="px-4 py-3 font-semibold">Vendedor</th>
                          <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Fecha</th>
                          <th className="px-4 py-3 font-semibold">No. Orden</th>
                          <th className="px-4 py-3 font-semibold">Consecutivo</th>
                          <th className="px-4 py-3 font-semibold">Código</th>
                          <th className="px-4 py-3 font-semibold">Cliente</th>
                          <th className="px-4 py-3 font-semibold">Destino</th>
                          <th className="px-4 py-3 text-right font-semibold">Ítems</th>
                          <th className="px-4 py-3 text-right font-semibold">Total (kg)</th>
                          <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-[#f0f2ee]">
                      {pendientesGrupos.map((g, i) => {
                        const codigo = activeCat.isTat
                          ? g.codigo
                          : (g.sobrescritoConcatenado && g.codigo) ||
                            codigoPorClave.get(claveCD(g.clienteAsignado ?? g.cliente, g.destino)) ||
                            codigoPorClave.get(claveCD(g.cliente, g.destino)) ||
                            g.codigo;
                        return (
                        <tr
                          key={g.key}
                          onClick={() => setDetalle(g)}
                          className="cursor-pointer hover:bg-[#f9fbf7]"
                        >
                          <td className="px-4 py-3 text-[#7a8794]">{i + 1}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">
                            {g.fecha || "—"}
                          </td>
                          <td className="px-4 py-3 font-medium text-[#14352a]">
                            {g.numeroOrden || "—"}
                          </td>
                          {activeCat.isTat ? (
                            <>
                              <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">{g.nit || "—"}</td>
                              <td className="px-4 py-3 text-[#45505e]">
                                {g.sobrescritoConcatenado && (
                                  <span className="block text-[10px] font-medium text-[#b5731e]">sobrescrito por concatenado</span>
                                )}
                                {tc(g.clienteAsignado ?? g.cliente) || "—"}
                              </td>
                              <td className="px-4 py-3 text-[#45505e]">{dirLimpia(g.direccion) ? tc(dirLimpia(g.direccion)) : "—"}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#45505e]">
                                {consolidarProductos(g.items).length}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#14352a]">
                                {g.totalKg.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#14352a]">
                                {g.totalValor > 0 ? fmtMoney(g.totalValor) : "—"}
                              </td>
                              <td className="px-4 py-3 text-[#45505e]">{g.vendedor ? tc(g.vendedor) : "—"}</td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <AccionesOrden
                                  onAsignar={() => setAsignarTarget(grupoAClienteSinReg(g))}
                                  onEditar={() => abrirEditar(g)}
                                  onEliminar={() => setEliminarSinRegTarget(grupoAClienteSinReg(g))}
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">
                                {`${tc(g.cliente)} - ${tc(g.destino)}`}
                              </td>
                              <td className="px-4 py-3">
                                {codigo ? (
                                  <span className="inline-flex rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">
                                    {codigo}
                                  </span>
                                ) : (
                                  <span className="text-xs text-[#c47f1a]">Sin código</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-[#45505e]">
                                {g.sobrescritoConcatenado && (
                                  <span className="block text-[10px] font-medium text-[#b5731e]">sobrescrito por concatenado</span>
                                )}
                                {g.clienteAsignado || g.cliente || "—"}
                              </td>
                              <td className="px-4 py-3 text-[#45505e]">{g.destino || "—"}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#45505e]">
                                {consolidarProductos(g.items).length}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#14352a]">
                                {g.totalKg.toFixed(2)}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <AccionesOrden
                                  onAsignar={() => setAsignarTarget(grupoAClienteSinReg(g))}
                                  onEditar={() => abrirEditar(g)}
                                  onEliminar={() => setEliminarSinRegTarget(grupoAClienteSinReg(g))}
                                />
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {pendientesGrupos.length > 0 && (
                <div className="flex shrink-0 items-center border-t border-[#eceef0] px-6 py-3 text-sm text-[#5f7a68]">
                  <span>{pendientesGrupos.length} órdenes pendientes</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {eliminarModalOpen && activeCat && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">
                Eliminar órdenes
              </h3>
              <p className="mt-1 text-sm text-[#5f7a68]">
                ¿Confirmas eliminar todas las órdenes de {activeCat.label}?
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={() => setEliminarModalOpen(false)}
                className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(catDeleteTipo(activeCat))}
                className="rounded-lg bg-[#b3261e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9b1e18]"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#eceef0] px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-[#14352a]">
                    Orden {detalle.numeroOrden}
                  </h3>
                  {detalle.estado === "Entregado" && (
                    <span className="inline-flex rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">
                      Entregado
                    </span>
                  )}
                  {detalle.estado === "Rechazado" && (
                    <span className="inline-flex rounded-full bg-[#fbeceb] px-2.5 py-0.5 text-xs font-medium text-[#b3261e]">
                      Rechazado
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[#5f7a68]">
                  {`${detalle.cliente} - ${detalle.destino}`} · {detalle.fecha}
                </p>
                {detalle.sobrescritoConcatenado && (
                  <p className="mt-0.5 text-xs font-medium text-[#b5731e]">
                    Cliente sobrescrito por concatenado
                    {detalle.clienteOriginal ? ` (original: ${tc(detalle.clienteOriginal)})` : ""}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDetalle(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3] hover:text-[#45505e]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Producto</th>
                    <th className="px-6 py-3 text-right font-semibold">Líneas</th>
                    <th className="px-6 py-3 text-right font-semibold">
                      Cant. (kg)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {consolidarProductos(detalle.items).map((p) => (
                    <tr key={p.producto}>
                      <td className="px-6 py-3 text-[#45505e]">{p.producto}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-[#45505e]">
                        {p.lineas}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-[#14352a]">
                        {p.cantidadKg.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-6 py-4 text-sm">
              <button
                onClick={() => {
                  setAsignarTarget(grupoAClienteSinReg(detalle));
                  setDetalle(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-3.5 py-2 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
              >
                <IconLink />
                Cambiar cliente
              </button>
              <span className="font-semibold text-[#14352a]">
                {detalle.items.length} líneas · Total: {detalle.totalKg.toFixed(2)} kg
              </span>
            </div>
          </div>
        </div>
      )}

      {verifModalOpen && verif && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="flex max-h-[92vh] w-[95vw] max-w-[1500px] flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#eceef0] px-6 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fdf6e9] text-[#a86a12]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[#14352a]">
                    Clientes sin registrar en Drivin
                  </h3>
                  <p className="mt-0.5 text-sm text-[#5f7a68]">
                    {verif.sinRegistrar.length} de {verif.totalDestinos} destinos no
                    están registrados en Drivin. Créalos allí (o corrige el nombre)
                    para que la orden tome su código y se geolocalice bien en el plan.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVerifModalOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3] hover:text-[#45505e]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="border-b border-[#eceef0] px-6 py-3">
              <SearchInput
                value={buscarVerif}
                onChange={setBuscarVerif}
                placeholder="Buscar cliente o destino…"
                className="max-w-sm"
              />
            </div>

            <div className="nice-scroll min-h-0 flex-1 overflow-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">NIT / Código</th>
                    <th className="px-4 py-3 font-semibold">Destino</th>
                    <th className="px-4 py-3 font-semibold">Dirección</th>
                    <th className="px-4 py-3 font-semibold">Concatenado</th>
                    <th className="px-4 py-3 font-semibold">No. Orden</th>
                    <th className="px-4 py-3 text-right font-semibold">Pedidos</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2ee]">
                  {verif.sinRegistrar
                    .filter((c) => {
                      const t = buscarVerif.trim().toLowerCase();
                      return (
                        !t ||
                        [c.cliente, c.destino, c.nit].some((f) =>
                          f?.toLowerCase().includes(t)
                        )
                      );
                    })
                    .map((c, i) => {
                      const esTat = c.distribucion === "TAT";
                      const dir = dirLimpia(c.direccion);
                      return (
                      <tr key={`${c.cliente}||${c.destino}`} className="hover:bg-[#f9fbf7]">
                        <td className="px-4 py-3 text-[#7a8794]">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-[#14352a]">
                          {tc(c.cliente) || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {esTat ? (
                            <span className="inline-flex rounded-full bg-[#fef3e6] px-2.5 py-0.5 text-xs font-medium text-[#b5731e]">TAT</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-[#e8f3e2] px-2.5 py-0.5 text-xs font-medium text-[#2f8f4e]">Distribución</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#45505e]">
                          {c.nit || c.codigo || "—"}
                        </td>
                        <td className="px-4 py-3 text-[#45505e]">
                          {esTat ? "—" : (tc(c.destino) || "—")}
                        </td>
                        <td className="px-4 py-3 text-[#45505e]">
                          {dir ? tc(dir) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[#45505e]">
                          {esTat ? "—" : `${tc(c.cliente)} - ${tc(c.destino)}`}
                        </td>
                        <td className="px-4 py-3 text-[#45505e]">
                          {c.numeros && c.numeros.length > 0 ? (
                            <span className="inline-flex flex-wrap gap-1">
                              {c.numeros.slice(0, 6).map((n) => (
                                <span
                                  key={n}
                                  className="rounded bg-[#f0f2ee] px-1.5 py-0.5 text-xs font-medium text-[#45505e]"
                                >
                                  {n}
                                </span>
                              ))}
                              {c.numeros.length > 6 && (
                                <span className="text-xs text-[#7a8794]">
                                  +{c.numeros.length - 6}
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#14352a]">
                          {c.pedidos}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              title="Asignar"
                              aria-label="Asignar"
                              onClick={() => setAsignarTarget(c)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe4e0] bg-white text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
                            >
                              <IconLink />
                            </button>
                            <button
                              title="Crear"
                              aria-label="Crear"
                              onClick={() => setCrearTarget(c)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#cfe4d6] bg-[#eef7ea] text-[#2f8f4e] transition-colors hover:bg-[#e2f0dc]"
                            >
                              <IconPlus />
                            </button>
                            <button
                              title="Eliminar"
                              aria-label="Eliminar"
                              onClick={() => setEliminarSinRegTarget(c)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e] transition-colors hover:bg-[#f7dcda]"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-[#eceef0] px-6 py-4 text-sm text-[#5f7a68]">
              <span>{verif.sinRegistrar.length} clientes sin registrar</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCruzarAuto}
                  disabled={cruzando}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#cfe4d6] bg-[#eef7ea] px-4 py-2.5 text-sm font-medium text-[#2f8f4e] transition-colors hover:bg-[#e2f0dc] disabled:opacity-60"
                >
                  <svg className={`h-4 w-4 ${cruzando ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                  {cruzando ? "Cruzando…" : "Cruzar automáticamente"}
                </button>
                <button
                  onClick={() => setVerifModalOpen(false)}
                  className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {asignarTarget && (
        <AsignarClienteModal
          target={asignarTarget}
          clientes={clientesDb}
          clientesTat={clientesTatDb}
          onClose={() => setAsignarTarget(null)}
          onAsignar={handleAsignar}
        />
      )}

      {scanOrigen && (
        <FacturaScanModal
          origen={scanOrigen}
          onClose={() => { setScanOrigen(null); load(); }}
          onSaved={() => load()}
        />
      )}

      {crearTarget && (() => {
        // Datos que ya vienen del archivo/API: código o NIT, dirección real, nombre.
        const ord = ordenes.find(
          (o) => claveCD(o.cliente, o.destino) === claveCD(crearTarget.cliente, crearTarget.destino)
        );
        const codigoAuto = crearTarget.codigo || crearTarget.nit || ord?.codigo || ord?.nit || "";
        const direccionAuto = dirLimpia(crearTarget.direccion || ord?.direccion);
        return (
        <ClienteFormModal
          modo="crear"
          nombreInicial={crearTarget.cliente}
          direccionInicial={direccionAuto}
          codigoInicial={codigoAuto}
          consecutivoInicial={`${crearTarget.cliente} - ${crearTarget.destino}`}
          onClose={() => setCrearTarget(null)}
          onSaved={(saved) => {
            setCrearTarget(null);
            const d = (saved as { drivin?: { ok: boolean; error?: string } }).drivin;
            setMessage(
              "Cliente creado." +
                (d ? (d.ok ? " Registrado en Drivin." : ` No se pudo crear en Drivin: ${d.error}.`) : "") +
                " Actualizando verificación…"
            );
            load();
          }}
        />
        );
      })()}

      {editGsTarget && (
        <ClienteFormModal
          modo="editarGS"
          gs={editGsTarget}
          onClose={() => setEditGsTarget(null)}
          onSaved={() => {
            setEditGsTarget(null);
            setMessage("Cliente actualizado.");
            load();
          }}
        />
      )}

      {editTatTarget && (
        <ClienteFormModal
          modo="editarTAT"
          tat={editTatTarget}
          onClose={() => setEditTatTarget(null)}
          onSaved={() => {
            setEditTatTarget(null);
            setMessage("Cliente actualizado.");
            load();
          }}
          onDeleted={() => {
            setEditTatTarget(null);
            load();
          }}
        />
      )}

      {/* Modal: confirmar eliminación de todas las órdenes de una card */}
      {borrarCard && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbeceb] text-[#b3261e]">
                <IconTrash />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#14352a]">
                  Eliminar órdenes de {borrarCard.label}
                </h3>
                <p className="mt-1 text-sm text-[#5f7a68]">
                  ¿Seguro que deseas eliminar <span className="font-semibold text-[#14352a]">todas las órdenes cargadas</span> de{" "}
                  <span className="font-semibold text-[#14352a]">{borrarCard.label}</span>? Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eceef0] px-5 py-3">
              <button
                onClick={() => setBorrarCard(null)}
                disabled={deleting}
                className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const t = catDeleteTipo(borrarCard);
                  setBorrarCard(null);
                  handleDelete(t);
                }}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#b3261e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9a2019] disabled:opacity-60"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar eliminación de órdenes de un cliente sin registrar */}
      {eliminarSinRegTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-6 pt-6">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbeceb] text-[#b3261e]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </span>
              <div>
                <h3 className="text-lg font-semibold text-[#14352a]">Eliminar órdenes</h3>
                <p className="mt-1 text-sm text-[#5f7a68]">
                  ¿Seguro que quieres eliminar{" "}
                  <span className="font-semibold text-[#14352a]">
                    {eliminarSinRegTarget.ids?.length ?? eliminarSinRegTarget.pedidos}
                  </span>{" "}
                  {(eliminarSinRegTarget.ids?.length ?? eliminarSinRegTarget.pedidos) === 1 ? "orden" : "órdenes"} de{" "}
                  <span className="font-semibold text-[#14352a]">{tc(eliminarSinRegTarget.cliente)}</span>? Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eceef0] px-6 py-4">
              <button
                onClick={() => setEliminarSinRegTarget(null)}
                disabled={eliminandoSinReg}
                className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminarSinRegistrar(eliminarSinRegTarget)}
                disabled={eliminandoSinReg}
                className="inline-flex items-center gap-2 rounded-lg bg-[#b3261e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9a2019] disabled:opacity-60"
              >
                {eliminandoSinReg && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" /></svg>
                )}
                {eliminandoSinReg ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Acciones por orden (editar / reasignar / eliminar) ────────────────────────
function AccionesOrden({
  onAsignar,
  onEditar,
  onEliminar,
}: {
  onAsignar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        title="Editar"
        aria-label="Editar"
        onClick={onEditar}
        className={`${base} border-[#dfe4e0] bg-white text-[#4a6fa5] hover:bg-[#eef2f8]`}
      >
        <IconPencil />
      </button>
      <button
        title="Reasignar cliente"
        aria-label="Reasignar cliente"
        onClick={onAsignar}
        className={`${base} border-[#dfe4e0] bg-white text-[#45505e] hover:bg-[#f4f6f3]`}
      >
        <IconLink />
      </button>
      <button
        title="Eliminar"
        aria-label="Eliminar"
        onClick={onEliminar}
        className={`${base} border-[#f0c4c1] bg-[#fbeceb] text-[#b3261e] hover:bg-[#f7dcda]`}
      >
        <IconTrash />
      </button>
    </div>
  );
}

// ── Modal: asignar el consecutivo a un cliente existente ──────────────────────
type ClienteAsignable = {
  key: string;
  id: string;
  tipo: "GS" | "TAT";
  nombre: string;
  direccion: string;
  codigo: string | null;
};

function AsignarClienteModal({
  target,
  clientes,
  clientesTat,
  onClose,
  onAsignar,
}: {
  target: ClienteSinRegistrar;
  clientes: Cliente[];
  clientesTat: ClienteTat[];
  onClose: () => void;
  onAsignar: (tipo: "GS" | "TAT", clienteId: string) => Promise<void>;
}) {
  const [buscar, setBuscar] = useState("");
  const [asignandoId, setAsignandoId] = useState<string | null>(null);

  // Lista unificada: todos los clientes GS (Distribución) + TAT.
  const todos: ClienteAsignable[] = [
    ...clientes.map((c) => ({
      key: `gs-${c.id}`,
      id: c.id,
      tipo: "GS" as const,
      nombre: c.cliente || c.nombreDireccion || "—",
      direccion: c.direccion || c.nombreDireccion || "",
      codigo: c.codigoDireccion,
    })),
    ...clientesTat.map((c) => {
      const suc = parseInt(String(c.sucursal ?? ""), 10);
      const base = c.codigoTercero ?? c.nit;
      const codigo = base
        ? Number.isFinite(suc)
          ? `${base}-${suc}`
          : base
        : null;
      return {
        key: `tat-${c.id}`,
        id: c.id,
        tipo: "TAT" as const,
        nombre: c.razonSocial || "—",
        direccion: c.direccion1 || "",
        codigo,
      };
    }),
  ];

  const t = buscar.trim().toLowerCase();
  const filtrados = t
    ? todos.filter((c) =>
        [c.nombre, c.codigo, c.direccion].some((f) =>
          f?.toLowerCase().includes(t)
        )
      )
    : todos;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Asignar a un cliente</h3>
          <p className="mt-0.5 text-sm text-[#5f7a68]">
            Se agregará el consecutivo{" "}
            <span className="font-medium text-[#14352a]">
              “{tc(target.cliente)} - {tc(target.destino)}”
            </span>{" "}
            al cliente que elijas.
          </p>
        </div>
        <div className="border-b border-[#eceef0] px-6 py-3">
          <SearchInput
            value={buscar}
            onChange={setBuscar}
            placeholder="Buscar cliente por nombre o código…"
            className="w-full"
          />
          <p className="mt-1.5 text-xs text-[#7a8794]">
            {filtrados.length} de {todos.length} clientes
          </p>
        </div>
        <div className="nice-scroll min-h-0 flex-1 overflow-auto">
          {filtrados.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#5f7a68]">
              No hay clientes que coincidan.
            </p>
          ) : (
            <ul className="divide-y divide-[#f0f2ee]">
              {filtrados.slice(0, 500).map((c) => (
                <li key={c.key}>
                  <button
                    onClick={async () => {
                      if (asignandoId) return;
                      setAsignandoId(c.key);
                      try {
                        await onAsignar(c.tipo, c.id);
                      } finally {
                        setAsignandoId(null);
                      }
                    }}
                    disabled={asignandoId !== null}
                    className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-[#f9fbf7] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium text-[#14352a]">
                        {tc(c.nombre) || "—"}
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            c.tipo === "TAT"
                              ? "bg-[#fdf0e3] text-[#b4711e]"
                              : "bg-[#e8f3e2] text-[#2f8f4e]"
                          }`}
                        >
                          {c.tipo === "TAT" ? "TAT" : "Distribución"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-[#7a8794]">
                        {tc(c.direccion) || "Sin dirección"}
                      </p>
                    </div>
                    {asignandoId === c.key ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#2f8f4e]">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Asignando…
                      </span>
                    ) : (
                      c.codigo && (
                        <span className="shrink-0 rounded-full bg-[#eef1f4] px-2.5 py-0.5 text-xs font-medium text-[#45505e]">
                          {c.codigo}
                        </span>
                      )
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-[#eceef0] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
