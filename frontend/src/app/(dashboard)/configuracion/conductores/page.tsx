"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { tc, btn } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";
import { AUXILIARES_BASE, type Auxiliar } from "@/data/planillaConfig";
import {
  ApiError,
  createConductor,
  deleteConductor,
  getAuxiliares,
  getConductores,
  saveAuxiliares,
  setConductorEstado,
  syncConductores,
  updateConductor,
  type Conductor,
  type ConductorInput,
} from "@/lib/api";

export default function ConductoresPage() {
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Conductor | null>(null);
  const [viewing, setViewing] = useState<Conductor | null>(null);
  const [showAuxiliares, setShowAuxiliares] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConductores(await getConductores());
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
    setError(null);
    try {
      await syncConductores();
    } catch {
      // si Drivin no responde, igual recargamos la BD local
    }
    await load();
    setRefreshing(false);
  }

  async function toggleEstado(c: Conductor) {
    try {
      await setConductorEstado(c.id, !c.activo);
      await load();
    } catch {
      // Si falla, se mantiene el estado actual.
    }
  }

  async function handleDelete(c: Conductor) {
    const nombre = [c.nombres, c.apellidos].filter(Boolean).join(" ") || "este conductor";
    if (!window.confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteConductor(c.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  const term = search.trim().toLowerCase();
  const sorted = [...conductores].sort((a, b) =>
    (a.nombres ?? "").localeCompare(b.nombres ?? "", "es")
  );

  const filtered = term
    ? sorted.filter((c) =>
        [c.nombres, c.apellidos, c.cedula, c.correo, c.perfil].some((f) =>
          f?.toLowerCase().includes(term)
        )
      )
    : sorted;

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">Conductores</h1>
          <p className="text-sm text-[#5f7a68]">
            Registra y gestiona los conductores.
          </p>
        </div>
        <button onClick={() => setShowAuxiliares(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          Auxiliares
        </button>
      </header>

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, cédula o correo…"
          className="w-full max-w-sm"
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon spinning={refreshing} />
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-[#b3261e]">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#5f7a68]">
            No se encontraron conductores.
          </p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombres</th>
                  <th className="px-4 py-3 font-semibold">Apellidos</th>
                  <th className="px-4 py-3 font-semibold">Cédula</th>
                  <th className="px-4 py-3 font-semibold">Celular</th>
                  <th className="px-4 py-3 font-semibold">Correo</th>
                  <th className="px-4 py-3 font-semibold">Empleador</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f9fbf7]">
                    <td className="px-4 py-3 font-medium text-[#14352a]">
                      {c.nombres || "—"}
                    </td>
                    <td className="px-4 py-3 text-[#45505e]">
                      {c.apellidos || "—"}
                    </td>
                    <td className="px-4 py-3 text-[#45505e]">{c.cedula ?? "—"}</td>
                    <td className="px-4 py-3 text-[#45505e]">
                      {c.celular ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#45505e]">{c.correo ?? "—"}</td>
                    <td className="px-4 py-3 text-[#45505e]">{c.depositos ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.activo
                            ? "bg-[#e8f3e2] text-[#2f8f4e]"
                            : "bg-[#f0f1f2] text-[#6b7683]"
                        }`}
                      >
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton title="Ver" onClick={() => setViewing(c)}>
                          <EyeIcon />
                        </IconButton>
                        <IconButton
                          title="Eliminar"
                          onClick={() => handleDelete(c)}
                          className="hover:border-[#b3261e] hover:bg-[#fbeceb] hover:text-[#b3261e]"
                        >
                          <TrashIcon />
                        </IconButton>
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
            <span>{filtered.length} registros</span>
          </div>
        )}
      </section>

      {formOpen && (
        <ConductorFormModal
          conductor={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}

      {viewing && (
        <VerConductorModal
          conductor={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      {showAuxiliares && (
        <AuxiliaresModal onClose={() => setShowAuxiliares(false)} />
      )}
    </div>
  );
}

let _auxNextId = 5000;
function newAuxId() { return `aux-${++_auxNextId}-${Date.now()}`; }

function AuxiliaresModal({ onClose }: { onClose: () => void }) {
  const [lista, setLista] = useState<Auxiliar[]>([]);
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<Auxiliar | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuxiliares()
      .then((data) => setLista(data as Auxiliar[]))
      .catch((err) => { console.error(err); setError("No se pudieron cargar los auxiliares"); });
  }, []);

  async function persistir(next: Auxiliar[]) {
    setLista(next);
    try {
      const guardado = await saveAuxiliares(next);
      setLista(guardado as Auxiliar[]);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  }

  function guardar() {
    if (!nombre.trim()) return;
    let next: Auxiliar[];
    if (editando) {
      next = lista.map((a) => a.id === editando.id ? { ...editando, nombre: nombre.trim(), telefono: telefono.trim() || undefined } : a);
    } else {
      next = [...lista, { id: newAuxId(), nombre: nombre.trim(), telefono: telefono.trim() || undefined }];
    }
    next = next.sort((a, b) => a.nombre.localeCompare(b.nombre));
    void persistir(next);
    setEditando(null);
    setCreando(false);
    setNombre(""); setTelefono("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function iniciarEditar(a: Auxiliar) { setEditando(a); setNombre(a.nombre); setTelefono(a.telefono ?? ""); setCreando(false); }
  function iniciarCrear() { setEditando(null); setNombre(""); setTelefono(""); setCreando(true); }
  function eliminar(id: string) { void persistir(lista.filter((a) => a.id !== id)); }

  const filtrado = lista.filter((a) => !buscar || a.nombre.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">Auxiliares de ruta</h3>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-[#2f8f4e]">✓ Guardado</span>}
            {error && <span className="text-xs text-[#b3261e]">{error}</span>}
            <button onClick={() => { void persistir(AUXILIARES_BASE); }} className="text-xs text-[#7a8794] hover:text-[#45505e]">Restaurar</button>
            <button onClick={iniciarCrear} className="inline-flex items-center gap-1 rounded-lg bg-[#2f8f4e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#277a42]">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {(creando || editando) && (
          <div className="shrink-0 grid grid-cols-1 gap-3 border-b border-[#eceef0] px-6 py-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Nombre *</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Aux. Juan Pérez" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#7a8794]">Teléfono</span>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300-0000000" className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
            </label>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={() => { setEditando(null); setCreando(false); }} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">Cancelar</button>
              <button onClick={guardar} disabled={!nombre.trim()} className="rounded-lg bg-[#2f8f4e] px-3 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-40">Guardar</button>
            </div>
          </div>
        )}

        <div className="shrink-0 px-6 py-3">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]" />
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
              <tr><th className="px-4 py-2 text-left font-semibold">Nombre</th><th className="px-4 py-2 text-left font-semibold">Teléfono</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2ee]">
              {filtrado.map((a) => (
                <tr key={a.id} className="hover:bg-[#f9fbf7]">
                  <td className="px-4 py-2.5 font-medium text-[#14352a]">{a.nombre}</td>
                  <td className="px-4 py-2.5 text-[#45505e]">{a.telefono || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => iniciarEditar(a)} className="rounded border border-[#f0d9b0] bg-[#fdf6e9] px-2 py-1 text-xs text-[#a86a12] hover:bg-[#faedd4]">Editar</button>
                      <button onClick={() => eliminar(a.id)} className="rounded border border-[#dfe4e0] bg-white px-2 py-1 text-xs text-[#b3261e] hover:bg-[#fbeceb]">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 border-t border-[#eceef0] px-6 py-3 text-xs text-[#7a8794]">
          {lista.length} auxiliares registrados
        </div>
      </div>
    </div>
  );
}

function ConductorFormModal({
  conductor,
  onClose,
  onSaved,
}: {
  conductor: Conductor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ConductorInput>({
    nombres: conductor?.nombres ?? "",
    apellidos: conductor?.apellidos ?? "",
    cedula: conductor?.cedula ?? "",
    correo: conductor?.correo ?? "",
    celular: conductor?.celular ?? "",
    perfil: conductor?.perfil ?? "Conductor",
    depositos: conductor?.depositos ?? "",
    clientes: conductor?.clientes ?? "",
    activo: conductor?.activo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ConductorInput>(key: K, value: ConductorInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nombres?.trim() || !form.apellidos?.trim() || !form.cedula?.trim()) {
      setError("Nombres, apellidos y cédula son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      if (conductor) {
        await updateConductor(conductor.id, form);
      } else {
        await createConductor(form);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={conductor ? "Editar Conductor" : "Nuevo Conductor"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <FormError>{error}</FormError>
            </div>
          )}
          <Field
            label="Nombres"
            value={form.nombres}
            onChange={(e) => set("nombres", e.target.value)}
            autoFocus
          />
          <Field
            label="Apellidos"
            value={form.apellidos}
            onChange={(e) => set("apellidos", e.target.value)}
          />
          <Field
            label="Cédula"
            value={form.cedula}
            onChange={(e) => set("cedula", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
          <Field
            label="Celular"
            value={form.celular ?? ""}
            onChange={(e) => set("celular", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
          <Field
            label="Correo electrónico"
            type="email"
            value={form.correo ?? ""}
            onChange={(e) => set("correo", e.target.value)}
          />
          <Field
            label="Perfil"
            value={form.perfil ?? ""}
            onChange={(e) => set("perfil", e.target.value)}
          />
          <Field
            label="Depósitos"
            value={form.depositos ?? ""}
            onChange={(e) => set("depositos", e.target.value)}
          />
          <Field
            label="Clientes"
            value={form.clientes ?? ""}
            onChange={(e) => set("clientes", e.target.value)}
          />
        </div>
        <ModalActions onClose={onClose} saving={saving} />
      </form>
    </ModalShell>
  );
}

function VerConductorModal({
  conductor,
  onClose,
}: {
  conductor: Conductor;
  onClose: () => void;
}) {
  const initials = `${tc(conductor.nombres)} ${tc(conductor.apellidos)}`
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ModalShell title="Detalle del conductor" onClose={onClose}>
      <div className="px-6 py-5">
        {/* Encabezado */}
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f3e2] text-lg font-semibold text-[#2f8f4e]">
            {initials || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[#14352a]">
              {tc(conductor.nombres)} {tc(conductor.apellidos)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-[#5f7a68]">{conductor.perfil}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  conductor.activo
                    ? "bg-[#e8f3e2] text-[#2f8f4e]"
                    : "bg-[#f0f1f2] text-[#6b7683]"
                }`}
              >
                {conductor.activo ? "Activo" : "Inactivo"}
              </span>
            </div>
          </div>
        </div>

        {/* Información */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow icon={<IdIcon />} label="Cédula" value={conductor.cedula} />
          <InfoRow icon={<PhoneIcon />} label="Celular" value={conductor.celular} />
          <InfoRow
            icon={<MailIcon />}
            label="Correo electrónico"
            value={conductor.correo}
            full
          />
          <InfoRow
            icon={<BadgeIcon />}
            label="Perfil"
            value={conductor.perfil}
          />
          <InfoRow
            icon={<WarehouseIcon />}
            label="Depósitos"
            value={conductor.depositos}
          />
          <InfoRow
            icon={<UsersIcon />}
            label="Clientes"
            value={conductor.clientes}
            full
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-[#eceef0] px-6 py-4">
        <button
          onClick={onClose}
          className={btn}
        >
          Cerrar
        </button>
      </div>
    </ModalShell>
  );
}

function InfoRow({
  icon,
  label,
  value,
  full,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  full?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-[#eef1ec] bg-[#f9fbf7] px-3 py-2.5 ${
        full ? "sm:col-span-2" : ""
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#2f8f4e] ring-1 ring-[#e1e9dd]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9aa4af]">
          {label}
        </p>
        <p className="truncate text-sm text-[#14352a]">{value || "—"}</p>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border border-[#dfe4e0] p-2 text-[#5b6670] transition-colors hover:bg-[#f4f6f3] hover:text-[#14352a] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
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
  );
}

function EyeIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  );
}

function IdIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2" />
      <path d="M14 10h4M14 14h3M5 16.5c.7-1.4 2.1-2 4-2s3.3.6 4 2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 13L2 9Z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}

function WarehouseIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35a2 2 0 0 1 1.26-1.86l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
      <path d="M6 18h12M6 14h12M6 22V10h12v12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#eceef0] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#14352a]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[#7a8794] transition-colors hover:bg-[#f4f6f3] hover:text-[#45505e]"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  saving,
}: {
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-[#eceef0] px-6 py-4">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className={btn}
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#c0392b]/25 bg-[#c0392b]/10 px-4 py-2.5 text-sm text-[#b3261e]">
      {children}
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[#3a4a3f]">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-[#dfe4e0] bg-white px-3 py-2.5 text-sm text-[#14352a] outline-none transition placeholder:text-[#a6b0a9] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
      />
    </label>
  );
}
