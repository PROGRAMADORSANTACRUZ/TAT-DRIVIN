import type { VehiculoExterno } from "@/lib/api";

// Modal compartido: quitar/mover una remisión (devolver o pasar a otro vehículo).
// Selector de vehículos en cards: verde = cabe, rojo suave = sin capacidad.
export default function QuitarRemisionModal({
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
