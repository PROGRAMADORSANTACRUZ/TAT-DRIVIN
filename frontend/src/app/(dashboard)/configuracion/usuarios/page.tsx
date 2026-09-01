"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  type AppUser,
  type AppUserInput,
} from "@/lib/api";
import { btn, btnSm } from "@/lib/utils";
import SearchInput from "@/components/SearchInput";

const ROLE_LABELS: Record<string, string> = {
  USER: "Usuario",
  ADMIN: "Administrador",
  DEVELOPER: "Desarrollador",
};

const ROLE_COLORS: Record<string, string> = {
  USER: "bg-[#f0f2ee] text-[#45505e]",
  ADMIN: "bg-[#e6effb] text-[#1a5fb4]",
  DEVELOPER: "bg-[#e8f3e2] text-[#2f8f4e]",
};

const EMPTY: AppUserInput = { cedula: "", name: "", role: "USER", password: "" };

export default function UsuariosPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; editing: AppUser | null }>({
    open: false,
    editing: null,
  });
  const [form, setForm] = useState<AppUserInput>(EMPTY);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await getUsers());
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

  function openCreate() {
    setForm(EMPTY);
    setModal({ open: true, editing: null });
  }

  function openEdit(u: AppUser) {
    setForm({ cedula: u.cedula, name: u.name ?? "", role: u.role, password: "" });
    setModal({ open: true, editing: u });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const data = { ...form };
      if (!data.password) delete data.password;
      if (modal.editing) {
        await updateUser(modal.editing.id, data);
        setMessage(`Usuario "${data.name}" actualizado.`);
      } else {
        await createUser(data);
        setMessage(`Usuario "${data.name}" creado.`);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AppUser) {
    if (!window.confirm(`¿Eliminar al usuario "${u.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(u.id);
    setError(null);
    try {
      await deleteUser(u.id);
      setMessage(`Usuario "${u.name}" eliminado.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar");
    } finally {
      setDeleting(null);
    }
  }

  const t = search.trim().toLowerCase();
  const filtered = t
    ? users.filter((u) => [u.cedula, u.name, u.role].some((f) => f?.toLowerCase().includes(t)))
    : users;

  const set = (k: keyof AppUserInput, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="flex h-full flex-col p-6 sm:p-8">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#14352a]">Usuarios</h1>
          <p className="text-sm text-[#5f7a68]">Gestión de acceso al sistema.</p>
        </div>
        <button
          onClick={openCreate}
          className={btn}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo usuario
        </button>
      </header>

      {message && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#cfe4d6] bg-[#e8f3e2] px-4 py-2.5 text-sm text-[#2f8f4e]">{message}</div>
      )}
      {error && !modal.open && (
        <div className="mb-4 shrink-0 rounded-lg border border-[#f0d4d1] bg-[#fbeceb] px-4 py-2.5 text-sm text-[#b3261e]">{error}</div>
      )}

      <div className="mb-4 shrink-0">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cédula, nombre o rol…"
          className="w-full max-w-sm"
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-[#5f7a68]">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#5f7a68]">No hay usuarios.</p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#eceef0] bg-[#f7faf5] text-xs uppercase tracking-wide text-[#7a8794]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Cédula</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Creado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2ee]">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-[#f9fbf7]">
                    <td className="px-4 py-3 font-medium text-[#14352a]">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-[#45505e]">{u.cedula}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-[#f0f2ee] text-[#45505e]"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#7a8794] text-xs">
                      {new Date(u.createdAt).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className={btnSm}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deleting === u.id}
                          className={btnSm}
                        >
                          {deleting === u.id ? "…" : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="shrink-0 border-t border-[#eceef0] px-4 py-3 text-sm text-[#5f7a68]">
            {filtered.length} usuarios
          </div>
        )}
      </section>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#eceef0] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#14352a]">
                {modal.editing ? "Editar usuario" : "Nuevo usuario"}
              </h3>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <Field label="Nombre completo *">
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Juan Pérez" className="input-base" />
              </Field>
              <Field label="Cédula * (solo números, 6-15 dígitos)">
                <input value={form.cedula} onChange={(e) => set("cedula", e.target.value.replace(/\D/g, ""))} placeholder="1234567890" inputMode="numeric" className="input-base" />
              </Field>
              <Field label="Rol">
                <select value={form.role} onChange={(e) => set("role", e.target.value)} className="input-base">
                  <option value="USER">Usuario</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="DEVELOPER">Desarrollador</option>
                </select>
              </Field>
              <Field label={modal.editing ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña *"}>
                <input
                  type="password"
                  value={form.password ?? ""}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={modal.editing ? "••••••••" : "Mínimo 4 caracteres"}
                  className="input-base"
                />
              </Field>
              {error && (
                <p className="rounded-lg bg-[#fbeceb] px-3 py-2 text-sm text-[#b3261e]">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eceef0] px-6 py-4">
              <button onClick={closeModal} className="rounded-lg border border-[#dfe4e0] px-4 py-2.5 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.cedula.trim()}
                className={btn}
              >
                {saving && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z"/>
                  </svg>
                )}
                {saving ? "Guardando…" : modal.editing ? "Guardar cambios" : "Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#45505e]">{label}</label>
      {children}
    </div>
  );
}
