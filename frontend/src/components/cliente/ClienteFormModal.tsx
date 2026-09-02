"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  crearCliente,
  deleteClienteTat,
  updateCliente,
  updateClienteTat,
  type Cliente,
  type ClienteTat,
} from "@/lib/api";
import { tc } from "@/lib/utils";
import DireccionInput, { TIPOS_VIA } from "./DireccionInput";
import MapaDireccion from "./MapaDireccion";
import CiudadInput from "./CiudadInput";
import { departamentoDeCiudad } from "@/data/colombia";

const INPUT_CLS =
  "w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none transition focus:border-[#2f8f4e]";

// Formulario común a los dos tipos de cliente.
interface Form {
  codigo: string;
  nombre: string;
  direccion: string;
  referencia: string;
  barrio: string;
  manzana: string;
  lote: string;
  tipoVia: string;
  ciudad: string;
  departamento: string;
  telefono: string;
  correo: string;
  puntoVenta: string;
  tipo: "TAT" | "Distribución";
  activo: boolean;
  lat: number | null;
  lng: number | null;
}

const VACIO: Form = {
  codigo: "", nombre: "", direccion: "", referencia: "", barrio: "", manzana: "",
  lote: "", tipoVia: "", ciudad: "",
  departamento: "", telefono: "", correo: "", puntoVenta: "", tipo: "Distribución",
  activo: true, lat: null, lng: null,
};

function numOrNull(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function fromGS(c: Cliente): Form {
  return {
    codigo: c.codigoDireccion ?? "",
    nombre: c.cliente ?? c.nombreDireccion ?? "",
    direccion: c.direccion ?? "",
    referencia: c.referencia ?? "",
    barrio: c.barrio ?? "",
    manzana: c.manzana ?? "",
    lote: c.lote ?? "",
    tipoVia: c.tipoVia ?? "",
    ciudad: c.comuna ?? "",
    departamento: c.provincia ?? "",
    telefono: c.telefono ?? "",
    correo: c.correo ?? "",
    puntoVenta: c.puntoVenta ?? "",
    tipo: (c.tipo as Form["tipo"]) || "Distribución",
    activo: c.activo ?? true,
    lat: numOrNull(c.lat),
    lng: numOrNull(c.lon),
  };
}

function fromTat(c: ClienteTat): Form {
  return {
    codigo: c.codigoTercero ?? "",
    nombre: c.razonSocial ?? "",
    direccion: c.direccion1 ?? "",
    referencia: c.referencia ?? "",
    barrio: c.barrio ?? "",
    manzana: c.manzana ?? "",
    lote: c.lote ?? "",
    tipoVia: c.tipoVia ?? "",
    ciudad: c.ciudad ?? "",
    departamento: c.departamento ?? "",
    telefono: c.telefono ?? c.celular ?? "",
    correo: c.correo ?? "",
    puntoVenta: c.puntoVenta ?? "",
    tipo: (c.tipo as Form["tipo"]) || "TAT",
    activo: true,
    lat: numOrNull(c.lat),
    lng: numOrNull(c.lon),
  };
}

export default function ClienteFormModal({
  modo,
  gs,
  tat,
  nombreInicial = "",
  consecutivoInicial,
  direccionInicial = "",
  codigoInicial = "",
  onClose,
  onSaved,
  onDeleted,
}: {
  modo: "crear" | "editarGS" | "editarTAT";
  gs?: Cliente;
  tat?: ClienteTat;
  nombreInicial?: string;
  consecutivoInicial?: string;
  direccionInicial?: string;
  codigoInicial?: string;
  onClose: () => void;
  onSaved: (cliente: Cliente | ClienteTat) => void;
  onDeleted?: () => void;
}) {
  const [form, setForm] = useState<Form>(() => {
    if (modo === "editarGS" && gs) return fromGS(gs);
    if (modo === "editarTAT" && tat) return fromTat(tat);
    return {
      ...VACIO,
      nombre: nombreInicial ? tc(nombreInicial) : "",
      direccion: direccionInicial ? tc(direccionInicial) : "",
      codigo: codigoInicial ?? "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Concatenados (consecutivos "cliente - destino") editables a mano.
  const [concatenados, setConcatenados] = useState<string[]>(gs?.consecutivos ?? tat?.consecutivos ?? []);
  const [nuevoConcat, setNuevoConcat] = useState("");
  function agregarConcat() {
    const v = nuevoConcat.trim();
    if (!v) return;
    setConcatenados((prev) => (prev.some((x) => x.toUpperCase() === v.toUpperCase()) ? prev : [...prev, v]));
    setNuevoConcat("");
  }
  function quitarConcat(c: string) {
    setConcatenados((prev) => prev.filter((x) => x !== c));
  }

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setForm((p) => ({ ...p, [campo]: valor }));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function guardar() {
    if (!form.nombre.trim()) { setError("El nombre del cliente es obligatorio."); return; }
    setSaving(true);
    setError(null);
    try {
      const latStr = form.lat != null ? String(form.lat) : null;
      const lngStr = form.lng != null ? String(form.lng) : null;
      if (modo === "editarTAT" && tat) {
        const guardado = await updateClienteTat(tat.id, {
          codigoTercero: tat.codigoTercero,
          nit: tat.nit,
          razonSocial: form.nombre.trim(),
          sucursal: tat.sucursal,
          descripcionSucursal: tat.descripcionSucursal,
          direccion1: form.direccion.trim() || null,
          barrio: form.barrio.trim() || null,
          manzana: form.manzana.trim() || null,
          lote: form.lote.trim() || null,
          tipoVia: form.tipoVia.trim() || null,
          ciudad: form.ciudad.trim() || null,
          departamento: form.departamento.trim() || null,
          pais: tat.pais,
          telefono: form.telefono.trim() || null,
          celular: tat.celular,
          correo: form.correo.trim() || null,
          idVendedor: tat.idVendedor,
          vendedor: tat.vendedor,
          idCriterio: tat.idCriterio,
          criterio: tat.criterio,
          referencia: form.referencia.trim() || null,
          lat: latStr,
          lon: lngStr,
          puntoVenta: form.puntoVenta.trim() || null,
          tipo: form.tipo,
          consecutivos: concatenados,
        });
        onSaved(guardado);
      } else {
        const payload = {
          codigoDireccion: form.codigo.trim() || null,
          cliente: form.nombre.trim(),
          direccion: form.direccion.trim() || null,
          referencia: form.referencia.trim() || null,
          comuna: form.ciudad.trim() || null,
          provincia: form.departamento.trim() || null,
          barrio: form.barrio.trim() || null,
          manzana: form.manzana.trim() || null,
          lote: form.lote.trim() || null,
          tipoVia: form.tipoVia.trim() || null,
          telefono: form.telefono.trim() || null,
          correo: form.correo.trim() || null,
          puntoVenta: form.puntoVenta.trim() || null,
          tipo: form.tipo,
          activo: form.activo,
          pais: "Colombia",
          lat: latStr,
          lon: lngStr,
        };
        if (modo === "editarGS" && gs) {
          const guardado = await updateCliente(gs.id, { ...payload, consecutivos: concatenados });
          onSaved(guardado);
        } else {
          const guardado = await crearCliente({
            ...payload,
            consecutivos: [...new Set([...(consecutivoInicial ? [consecutivoInicial] : []), ...concatenados])],
          });
          onSaved(guardado);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el cliente");
    } finally {
      setSaving(false);
    }
  }

  const titulo = modo === "crear" ? "Nuevo cliente" : "Editar cliente";

  async function eliminar() {
    if (!tat) return;
    if (!window.confirm(`¿Eliminar a ${form.nombre || "este cliente"}? No reaparecerá al sincronizar.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteClienteTat(tat.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3">
      <div
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-[#14352a]">{titulo}</h3>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                form.tipo === "TAT" ? "bg-[#fef3e6] text-[#b5731e]" : "bg-[#e8f3e2] text-[#2f8f4e]"
              }`}
            >
              {form.tipo}
            </span>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-[#b3261e]/25 bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">
              {error}
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* Columna izquierda */}
            <div className="space-y-3">
              <Bloque titulo="Identificación">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Código / NIT / Cédula">
                    <input value={form.codigo} onChange={(e) => set("codigo", e.target.value)} className={INPUT_CLS} />
                  </Campo>
                  <label className="flex items-end gap-2 pb-2 text-sm text-[#45505e]">
                    <input type="checkbox" checked={form.activo} onChange={(e) => set("activo", e.target.checked)} className="h-4 w-4 accent-[#2f8f4e]" />
                    Cliente activo
                  </label>
                  <Campo label="Nombre / Razón social *" full>
                    <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} onBlur={(e) => set("nombre", tc(e.target.value))} className={INPUT_CLS} />
                  </Campo>
                </div>
              </Bloque>

              <Bloque titulo="Dirección">
                <DireccionInput value={form.direccion} onChange={(v) => set("direccion", v)} />
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Campo label="Tipo de vía">
                    <select value={form.tipoVia} onChange={(e) => set("tipoVia", e.target.value)} className={INPUT_CLS}>
                      <option value="">—</option>
                      {TIPOS_VIA.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Manzana">
                    <input value={form.manzana} onChange={(e) => set("manzana", e.target.value)} placeholder="Ej. 5 / B" className={INPUT_CLS} />
                  </Campo>
                  <Campo label="Lote">
                    <input value={form.lote} onChange={(e) => set("lote", e.target.value)} placeholder="Ej. 12" className={INPUT_CLS} />
                  </Campo>
                </div>
                <div className="mt-3">
                  <Campo label="Referencia">
                    <input value={form.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ej. frente al parque, casa esquinera…" className={INPUT_CLS} />
                  </Campo>
                </div>
              </Bloque>

              <Bloque titulo="Contacto">
                <div className="flex flex-wrap gap-3">
                  <Campo label="Teléfono">
                    <input
                      value={form.telefono}
                      onChange={(e) => set("telefono", e.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      placeholder="3001234567"
                      className={`${INPUT_CLS} max-w-[10rem]`}
                    />
                  </Campo>
                  <Campo label="Correo electrónico">
                    <input
                      value={form.correo}
                      onChange={(e) => set("correo", e.target.value)}
                      type="email"
                      placeholder="correo@ejemplo.com"
                      className={`${INPUT_CLS} min-w-[14rem]`}
                    />
                  </Campo>
                </div>
              </Bloque>

              <Bloque titulo={`Concatenados (${concatenados.length})`}>
                <div className="flex gap-2">
                  <input
                    value={nuevoConcat}
                    onChange={(e) => setNuevoConcat(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarConcat(); } }}
                    placeholder="CLIENTE - DESTINO  o  NIT-sucursal (ej. 900554896-2)"
                    className={`${INPUT_CLS} min-w-0 flex-1`}
                  />
                  <button type="button" onClick={agregarConcat} className="shrink-0 rounded-lg bg-[#2f8f4e] px-3 py-2 text-sm font-medium text-white hover:bg-[#277a42]">Agregar</button>
                </div>
                <p className="mt-1 text-[11px] text-[#7a8794]">Agrega un NIT-sucursal (ej. 900554896-2) para que ese cliente TAT se despache con este cliente.</p>
                {concatenados.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {concatenados.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[#eef2f8] px-2.5 py-1 text-[11px] font-medium text-[#4a6fa5]">
                        {c}
                        <button type="button" onClick={() => quitarConcat(c)} title="Quitar" className="text-[#4a6fa5] hover:text-[#b3261e]">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#7a8794]">Sin concatenados asignados a este cliente.</p>
                )}
              </Bloque>

              <Bloque titulo="Clasificación">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-[#45505e]">
                    <input type="radio" name="tipo-cliente" checked={form.tipo === "Distribución"} onChange={() => set("tipo", "Distribución")} className="h-4 w-4 accent-[#2f8f4e]" />
                    Distribución
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#45505e]">
                    <input type="radio" name="tipo-cliente" checked={form.tipo === "TAT"} onChange={() => set("tipo", "TAT")} className="h-4 w-4 accent-[#2f8f4e]" />
                    TAT
                  </label>
                </div>
                <div className="mt-2">
                  <Campo label="Punto de venta">
                    <input value={form.puntoVenta} onChange={(e) => set("puntoVenta", e.target.value)} placeholder="PDV La 43" className={INPUT_CLS} />
                  </Campo>
                </div>
              </Bloque>
            </div>

            {/* Columna derecha */}
            <div className="space-y-3">
              <Bloque titulo="Barrio y ciudad">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Barrio">
                    <input value={form.barrio} onChange={(e) => set("barrio", e.target.value)} onBlur={(e) => set("barrio", tc(e.target.value))} placeholder="Barrio" className={INPUT_CLS} />
                  </Campo>
                  <Campo label="Ciudad">
                    <CiudadInput
                      value={form.ciudad}
                      onSelect={(ciudad, departamento) =>
                        setForm((p) => ({ ...p, ciudad, departamento }))
                      }
                    />
                  </Campo>
                  <Campo label="Departamento" full>
                    <input
                      value={form.departamento}
                      readOnly
                      placeholder="Se completa al elegir la ciudad"
                      className={`${INPUT_CLS} cursor-not-allowed bg-[#f4f6f3] text-[#7a8794]`}
                    />
                  </Campo>
                </div>
              </Bloque>

              <Bloque titulo="Ubicación del pedido">
                <MapaDireccion
                  direccion={form.direccion}
                  barrio={form.barrio}
                  ciudad={form.ciudad}
                  referencia={form.referencia}
                  lat={form.lat}
                  lng={form.lng}
                  onUbicacion={(la, lo) => setForm((p) => ({ ...p, lat: la, lng: lo }))}
                  onBarrio={(b) => set("barrio", b)}
                  onCiudad={(ci) => setForm((p) => ({ ...p, ciudad: ci, departamento: departamentoDeCiudad(ci) ?? p.departamento }))}
                />
              </Bloque>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
          {modo === "editarTAT" && onDeleted && (
            <button onClick={eliminar} disabled={saving} className="mr-auto rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#b3261e] hover:bg-[#fbeceb] disabled:opacity-50">
              Eliminar
            </button>
          )}
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3] disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving} className="rounded-lg bg-[#2f8f4e] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50">
            {saving ? "Guardando…" : modo === "crear" ? "Crear cliente" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-[#7a8794]">{label}</span>
      {children}
    </label>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e1e9dd] bg-[#fbfdfa] p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#2f8f4e]">{titulo}</h4>
      {children}
    </section>
  );
}
