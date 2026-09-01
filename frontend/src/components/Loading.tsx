// Minimalist loading components — spinner, skeleton rows, skeleton cards

/** Spinner inline para botones y acciones */
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-current ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
    </svg>
  );
}

/** Loader centrado para páginas completas */
export function PageLoader() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2f8f4e] opacity-20" />
        <span className="relative inline-flex h-5 w-5 rounded-full bg-[#2f8f4e] opacity-70" />
      </div>
      <p className="text-xs font-medium text-[#7a8794]">Cargando…</p>
    </div>
  );
}

/** Skeleton para una fila de tabla */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  const widths = ["w-16", "w-24", "w-32", "w-20", "w-28", "w-14", "w-36"];
  return (
    <tr className="animate-pulse border-b border-[#f0f2ee]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-3 rounded-full bg-[#e8ecea] ${widths[i % widths.length]}`} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton para múltiples filas de tabla */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </tbody>
  );
}

/** Skeleton para una card genérica */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl border border-[#e1e9dd] bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="h-4 w-24 rounded-full bg-[#e8ecea]" />
        <div className="h-4 w-12 rounded-full bg-[#e8ecea]" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded-full bg-[#e8ecea]" />
        <div className="h-3 w-4/5 rounded-full bg-[#e8ecea]" />
        <div className="h-3 w-3/5 rounded-full bg-[#e8ecea]" />
      </div>
    </div>
  );
}

/** Skeleton para la card de vehículo del diagrama */
export function SkeletonVehicleCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-[#e1e9dd] shadow-sm">
      <div className="flex items-center gap-3 bg-[#e8ecea] px-4 py-3">
        <div className="h-6 w-6 rounded border-2 border-white/30" />
        <div className="h-12 w-14 rounded-lg bg-white/20" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 rounded-full bg-white/30" />
          <div className="h-2 w-20 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="space-y-2 bg-[#f7faf5] px-4 py-3">
        <div className="h-2 w-full rounded-full bg-[#dde5db]" />
      </div>
      <div className="space-y-2 px-4 py-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-16 rounded-full bg-[#e8ecea]" />
            <div className="h-2.5 flex-1 rounded-full bg-[#e8ecea]" />
            <div className="h-2.5 w-8 rounded-full bg-[#e8ecea]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton para la card de planilla del panel izquierdo */
export function SkeletonPlanillaCard() {
  return (
    <div className="animate-pulse flex flex-col rounded-xl border border-[#e1e9dd] bg-[#f9fbf7] p-2.5 gap-1.5">
      <div className="flex items-center gap-1">
        <div className="h-2.5 w-8 rounded-full bg-[#dde5db]" />
        <div className="h-4 w-14 rounded bg-[#e8ecea]" />
      </div>
      <div className="h-2.5 w-24 rounded-full bg-[#dde5db]" />
      <div className="h-2 w-20 rounded-full bg-[#dde5db]" />
    </div>
  );
}

/** Skeleton stat card */
export function SkeletonStat() {
  return (
    <div className="animate-pulse rounded-xl border border-[#e1e9dd] bg-white p-4 shadow-sm">
      <div className="mb-2 h-2.5 w-16 rounded-full bg-[#e8ecea]" />
      <div className="h-7 w-12 rounded-full bg-[#dde5db]" />
    </div>
  );
}
