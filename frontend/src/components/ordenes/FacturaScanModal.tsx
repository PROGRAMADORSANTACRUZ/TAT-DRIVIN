"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { ApiError, consultarFactura, type FacturaResult } from "@/lib/api";
import { tc } from "@/lib/utils";

const fmtMoney = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Extrae NumFac y FecFac del contenido del QR de la factura electrónica (DIAN).
function parseQR(texto: string): { numFac: string; fecFac: string } | null {
  const map = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf(":");
    if (i < 0) continue;
    map.set(linea.slice(0, i).trim().toLowerCase(), linea.slice(i + 1).trim());
  }
  const numFac = map.get("numfac") ?? "";
  const fecFac = (map.get("fecfac") ?? "").slice(0, 10);
  if (!numFac) return null;
  return { numFac, fecFac };
}

export default function FacturaScanModal({
  origen,
  onClose,
  onSaved,
}: {
  origen: "AGROPECUARIA" | "INVERSIONES";
  onClose: () => void;
  onSaved: () => void;
}) {
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const procesandoRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<FacturaResult[]>([]);
  const [manualNum, setManualNum] = useState("");
  const [manualFec, setManualFec] = useState(new Date().toISOString().slice(0, 10));
  const [gunText, setGunText] = useState("");
  const [camActiva, setCamActiva] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // Guarda una factura (por NumFac/FecFac) y la agrega a la lista.
  const guardar = useCallback(
    async (numFac: string, fecFac: string) => {
      if (procesandoRef.current) return;
      procesandoRef.current = true;
      setBuscando(true);
      setError(null);
      try {
        const r = await consultarFactura(origen, numFac, fecFac || new Date().toISOString().slice(0, 10));
        setResultados((prev) =>
          prev.some((x) => x.numeroOrden === r.numeroOrden) ? prev : [r, ...prev]
        );
        onSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo consultar la factura");
      } finally {
        setBuscando(false);
        setTimeout(() => { procesandoRef.current = false; }, 1200);
      }
    },
    [origen, onSaved]
  );

  // Pistola QR / pegado: al recibir el contenido del QR, se parsea y consulta.
  useEffect(() => {
    if (!gunText.trim()) return;
    const t = setTimeout(() => {
      const p = parseQR(gunText);
      if (p) { guardar(p.numFac, p.fecFac); setGunText(""); }
    }, 350);
    return () => clearTimeout(t);
  }, [gunText, guardar]);

  const stopCam = useCallback(async () => {
    const inst = html5Ref.current;
    html5Ref.current = null;
    if (inst) {
      try { await inst.stop(); } catch { /* ya detenida */ }
      try { inst.clear(); } catch { /* noop */ }
    }
    setCamActiva(false);
  }, []);

  async function toggleCam() {
    if (camActiva) { await stopCam(); return; }
    setCamError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode("factura-qr-reader");
      html5Ref.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          const p = parseQR(decoded);
          if (p) guardar(p.numFac, p.fecFac);
        },
        () => { /* frames sin código */ }
      );
      setCamActiva(true);
    } catch {
      setCamError("No se pudo abrir la cámara. Usa la pistola QR o el modo manual.");
      html5Ref.current = null;
    }
  }

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      const inst = html5Ref.current;
      if (inst) { inst.stop().catch(() => {}); }
    };
  }, []);

  async function cerrar() {
    await stopCam();
    onClose();
  }

  const etiqueta = origen === "INVERSIONES" ? "TAT Inversiones" : "TAT Agropecuaria";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2 sm:p-3">
      <div className="flex max-h-[95vh] w-[99vw] max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#eceef0] px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#14352a]">Leer factura · {etiqueta}</h3>
            <p className="truncate text-xs text-[#7a8794]">Pistola QR, cámara o manual.</p>
          </div>
          <button onClick={cerrar} aria-label="Cerrar" className="shrink-0 rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-auto p-4">
          {/* Pistola QR / pegar (método principal en proceso) */}
          <div className="rounded-xl border border-[#2f8f4e]/30 bg-[#f7faf5] p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#2f8f4e]">Pistola QR / pegar</p>
            <textarea
              autoFocus
              value={gunText}
              onChange={(e) => setGunText(e.target.value)}
              rows={2}
              placeholder="Escanea aquí con la pistola o pega el contenido del QR…"
              className="w-full resize-none rounded-lg border border-[#dfe4e0] bg-white px-3 py-2 text-sm text-[#14352a] outline-none focus:border-[#2f8f4e]"
            />
            <p className="mt-1 text-[11px] text-[#7a8794]">Deja el cursor aquí y dispara la pistola; se busca sola.</p>
          </div>

          {/* Cámara */}
          <div className="mt-3">
            <button
              onClick={toggleCam}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              {camActiva ? "Cerrar cámara" : "Escanear con cámara"}
            </button>
            <div className={`mt-2 overflow-hidden rounded-xl bg-black ${camActiva ? "" : "hidden"}`}>
              <div id="factura-qr-reader" className="w-full [&_video]:w-full [&_video]:object-cover" />
            </div>
            {camError && <p className="mt-2 rounded-lg bg-[#fbeceb] px-3 py-2 text-xs text-[#b3261e]">{camError}</p>}
          </div>

          {/* Manual */}
          <div className="mt-3 rounded-xl border border-[#e1e9dd] bg-white p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#7a8794]">Manual</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-[#7a8794]">N.º factura (NumFac)</span>
                <input value={manualNum} onChange={(e) => setManualNum(e.target.value)} placeholder="FEP62162" className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
              </label>
              <label className="sm:w-40">
                <span className="mb-1 block text-xs text-[#7a8794]">Fecha (FecFac)</span>
                <input type="date" value={manualFec} onChange={(e) => setManualFec(e.target.value)} className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
              </label>
              <button
                onClick={() => manualNum.trim() && guardar(manualNum.trim(), manualFec)}
                disabled={buscando || !manualNum.trim()}
                className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-50"
              >
                Buscar
              </button>
            </div>
          </div>

          {buscando && (
            <p className="mt-3 text-center text-xs font-medium text-[#2f8f4e]">Consultando factura…</p>
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-3 py-2 text-sm text-[#b3261e]">{error}</div>
          )}

          {resultados.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-[#7a8794]">Leídas en esta sesión ({resultados.length})</p>
              <ul className="divide-y divide-[#f0f2ee] rounded-xl border border-[#eceef0]">
                {resultados.map((r) => (
                  <li key={r.numeroOrden} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[#14352a]">{r.numeroOrden}</span>
                      <span className="shrink-0 text-xs text-[#2f8f4e]">{r.totalKg} kg · {fmtMoney(r.totalValor)}</span>
                    </div>
                    <p className="truncate text-xs text-[#7a8794]">{tc(r.cliente)} · {r.productos.length} producto(s)</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-[#eceef0] px-4 py-3">
          <button onClick={cerrar} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42]">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
