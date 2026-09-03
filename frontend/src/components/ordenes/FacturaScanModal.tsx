"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, consultarFactura, type FacturaResult } from "@/lib/api";
import { tc } from "@/lib/utils";

// BarcodeDetector no está en los tipos estándar del DOM.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const loopRef = useRef<number | null>(null);
  const ultimoRef = useRef<string>("");
  const procesandoRef = useRef(false);

  const [soporta, setSoporta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<FacturaResult[]>([]);
  const [manualNum, setManualNum] = useState("");
  const [manualFec, setManualFec] = useState(new Date().toISOString().slice(0, 10));

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
        // Permite re-escanear tras un breve intervalo.
        setTimeout(() => { procesandoRef.current = false; }, 1200);
      }
    },
    [origen, onSaved]
  );

  // Inicializa cámara + BarcodeDetector.
  useEffect(() => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) { setSoporta(false); return; }
    detectorRef.current = new Ctor({ formats: ["qr_code"] });

    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const tick = async () => {
          if (cancelado) return;
          const v = videoRef.current;
          const det = detectorRef.current;
          if (v && det && v.readyState >= 2 && !procesandoRef.current) {
            try {
              const codes = await det.detect(v);
              const raw = codes[0]?.rawValue;
              if (raw && raw !== ultimoRef.current) {
                ultimoRef.current = raw;
                const parsed = parseQR(raw);
                if (parsed) await guardar(parsed.numFac, parsed.fecFac);
                else setError("QR no reconocido (no trae NumFac).");
                setTimeout(() => { ultimoRef.current = ""; }, 2000);
              }
            } catch { /* ignora frames sin código */ }
          }
          loopRef.current = requestAnimationFrame(tick);
        };
        loopRef.current = requestAnimationFrame(tick);
      } catch {
        setError("No se pudo acceder a la cámara. Usa el modo manual.");
        setSoporta(false);
      }
    })();

    return () => {
      cancelado = true;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [guardar]);

  const etiqueta = origen === "INVERSIONES" ? "TAT Inversiones" : "TAT Agropecuaria";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#eceef0] px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-[#14352a]">Leer factura · {etiqueta}</h3>
            <p className="text-xs text-[#7a8794]">Escanea el QR de la factura o ingrésala manualmente.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="nice-scroll min-h-0 flex-1 overflow-auto p-4">
          {soporta ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-40 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              </div>
              {buscando && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#14352a]">
                  Consultando…
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-[#fef9e7] px-3 py-2 text-xs text-[#8a6d1e]">
              Este dispositivo no soporta escaneo por cámara. Ingresa la factura manualmente.
            </p>
          )}

          {/* Modo manual */}
          <div className="mt-3 rounded-xl border border-[#e1e9dd] bg-[#fbfdfa] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#2f8f4e]">Manual</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-[#7a8794]">N.º factura (NumFac)</span>
                <input value={manualNum} onChange={(e) => setManualNum(e.target.value)} placeholder="FEP62162" className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[#7a8794]">Fecha (FecFac)</span>
                <input type="date" value={manualFec} onChange={(e) => setManualFec(e.target.value)} className="rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]" />
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

          {error && (
            <div className="mt-3 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-3 py-2 text-sm text-[#b3261e]">{error}</div>
          )}

          {/* Facturas leídas en esta sesión */}
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

        <div className="flex shrink-0 justify-end border-t border-[#eceef0] px-5 py-3">
          <button onClick={onClose} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42]">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
