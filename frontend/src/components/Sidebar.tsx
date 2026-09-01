"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getUser, type AuthUser } from "@/lib/api";
import { puedeAcceder } from "@/data/modulos";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[]; // sub-items for dropdown
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const truckIcon = (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);

const usersIcon = (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const nivelServicioIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const clientesIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>
  </svg>
);

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>
    ),
  },
  {
    href: "/ordenes",
    label: "Cargar Órdenes",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/>
        <path d="M9 7h6M9 11h6M9 15h4"/>
      </svg>
    ),
  },
  { href: "/asignacion-vehiculos", label: "Asignación de órdenes", icon: truckIcon },
  {
    href: "/planes",
    label: "Diagrama",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/>
      </svg>
    ),
  },
  {
    href: "/planificacion-dl",
    label: "Planificación D.L.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    href: "/historicos",
    label: "Históricos",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
      </svg>
    ),
  },
  {
    href: "/nivel-de-servicio",
    label: "Nivel de servicio",
    icon: nivelServicioIcon,
    children: [
      { href: "/nivel-de-servicio", label: "Distribución", icon: nivelServicioIcon },
      { href: "/nivel-de-servicio/tat", label: "TAT", icon: nivelServicioIcon },
    ],
  },
  { href: "/configuracion/clientes", label: "Clientes", icon: clientesIcon },
];

const navGroups: NavGroup[] = [
  {
    label: "Configuración",
    items: [
      { href: "/configuracion/vehiculos", label: "Vehículos", icon: truckIcon },
      { href: "/configuracion/rutas", label: "Rutas", icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 12c0-4.4 3.6-8 8-8M3 12c0 4.4 3.6 8 8 8M21 12c0-4.4-3.6-8-8-8M21 12c0 4.4-3.6 8-8 8M11 4c2 3 2 10 0 16M13 4c-2 3-2 10 0 16"/>
          </svg>
        )},
      { href: "/configuracion/conductores", label: "Conductores", icon: usersIcon },
      {
        href: "/configuracion/usuarios",
        label: "Usuarios",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            <line x1="19" y1="8" x2="22" y2="8"/><line x1="19" y1="11" x2="22" y2="11"/>
          </svg>
        ),
      },
      {
        href: "/configuracion/plan-nombres",
        label: "Nombres de planes",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        ),
      },
    ],
  },
];

const roleLabels: Record<string, string> = {
  USER: "Usuario",
  ADMIN: "Administrador",
  DEVELOPER: "Desarrollador",
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((g) => [g.label, true]))
  );
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  useEffect(() => { setUser(getUser()); }, []);

  function toggleGroup(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }
  function toggleDropdown(href: string) {
    setOpenDropdowns((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  const initials = (user?.name ?? user?.cedula ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-[#eceef0] bg-white">
      {/* Marca */}
      <div className="flex items-center gap-3 border-b border-[#eceef0] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f8ee] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Santacruz" className="h-full w-full object-contain" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-[#1f2937]">Santacruz</p>
          <p className="text-xs text-[#9aa4af]">Panel de gestión</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {navItems.filter((item) => puedeAcceder(item.href, user?.role, user?.permisos)).map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`) && !item.children);
            const anyChildActive = item.children?.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
            const isDropOpen = openDropdowns[item.href] ?? anyChildActive ?? false;

            if (item.children) {
              return (
                <div key={item.href}>
                  <button
                    onClick={() => toggleDropdown(item.href)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      anyChildActive ? "bg-[#e8f3e2] font-semibold text-[#2f8f4e]" : "font-medium text-[#45505e] hover:bg-[#f4f6f3]"
                    }`}
                  >
                    <span className={anyChildActive ? "text-[#2f8f4e]" : "text-[#7a8794]"}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <svg className={`h-4 w-4 transition-transform ${isDropOpen ? "" : "-rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {isDropOpen && (
                    <div className="ml-8 mt-0.5 space-y-0.5">
                      {item.children.map((child) => {
                        const ca = pathname === child.href;
                        return (
                          <Link key={child.href} href={child.href}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${ca ? "bg-[#e8f3e2] font-semibold text-[#2f8f4e]" : "font-medium text-[#45505e] hover:bg-[#f4f6f3]"}`}>
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-[#e8f3e2] font-semibold text-[#2f8f4e]" : "font-medium text-[#45505e] hover:bg-[#f4f6f3]"}`}>
                <span className={active ? "text-[#2f8f4e]" : "text-[#7a8794]"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {navGroups.map((group) => {
          const isOpen = open[group.label];
          const visibleItems = group.items.filter((item) => puedeAcceder(item.href, user?.role, user?.permisos));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#9aa4af] transition-colors hover:text-[#6b7683]"
              >
                {group.label}
                <svg
                  className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {visibleItems.map((item) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "bg-[#e8f3e2] font-semibold text-[#2f8f4e]"
                            : "font-medium text-[#45505e] hover:bg-[#f4f6f3]"
                        }`}
                      >
                        <span
                          className={active ? "text-[#2f8f4e]" : "text-[#7a8794]"}
                        >
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Usuario */}
      <div className="border-t border-[#eceef0] p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3e2] text-sm font-semibold text-[#2f8f4e]">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-[#1f2937]">
              {user?.name ?? user?.cedula ?? "Usuario"}
            </p>
            <p className="truncate text-xs text-[#9aa4af]">
              {user?.role ? roleLabels[user.role] ?? user.role : ""}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#45505e] transition-colors hover:bg-[#f4f6f3]"
        >
          <svg
            className="h-5 w-5 text-[#7a8794]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
