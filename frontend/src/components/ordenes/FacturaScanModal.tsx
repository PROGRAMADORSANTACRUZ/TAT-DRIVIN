"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { ApiError, consultarFactura, type FacturaResult } from "@/lib/api";
import { tc } from "@/lib/utils";

const fmtMoney = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Detecta navegadores embebidos (WhatsApp, Instagram, Facebook, TikTok) donde
// getUserMedia suele fallar o crashear ("This page couldn't load").
function esNavegadorInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /(FBAN|FBAV|Instagram|WhatsApp|Line|TikTok|MicroMessenger)/i.test(ua);
}

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
  const procesandoRef = useRef(false);
  const html5Ref = useRef<Html5Qrcode | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<FacturaResult[]>([]);
  const [manualNum, setManualNum] = useState("");
  const [manualFec, setManualFec] = useState(new Date().toISOString().slice(0, 10));
  const [camOpen, setCamOpen] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);

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
        setUltima(r.numeroOrden);
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

  // Pistola QR (teclado-wedge): captura global, sin necesidad de hacer foco.
  // El escáner "teclea" el contenido muy rápido; se acumula y se busca solo.
  useEffect(() => {
    let buffer = "";
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // Pausa larga = tecleo humano → reinicia el buffer.
      if (now - last > 120) buffer = "";
      last = now;
      if (e.key === "Enter") buffer += "\n";
      else if (e.key.length === 1) buffer += e.key;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const p = parseQR(buffer);
        if (p) guardar(p.numFac, p.fecFac);
        buffer = "";
      }, 160);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (timer) clearTimeout(timer); };
  }, [guardar]);

  // Cámara en tiempo real: arranca cuando el modal de cámara está montado y visible.
  useEffect(() => {
    if (!camOpen) return;
    let inst: Html5Qrcode | null = null;
    setCamError(null);
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        inst = new Html5Qrcode("factura-qr-reader", {
          // El QR de la DIAN es muy denso: usa el detector nativo si existe.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        });
        html5Ref.current = inst;
        const onDecode = (decoded: string) => {
          const p = parseQR(decoded);
          if (p) guardar(p.numFac, p.fecFac);
        };
        // Recuadro grande (80% del lado menor) y alta resolución: el QR de la
        // factura tiene muchos módulos y necesita nitidez para decodificarse.
        const config = {
          fps: 15,
          qrbox: (w: number, h: number) => {
            const size = Math.floor(Math.min(w, h) * 0.8);
            return { width: size, height: size };
          },
        };
        try {
          await inst.start(
            { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
            config,
            onDecode,
            () => { /* frames sin código */ }
          );
        } catch {
          // Reintento sin restricción de resolución (algunos móviles la rechazan).
          await inst.start({ facingMode: "environment" }, config, onDecode, () => {});
        }
      } catch {
        setCamError(
          "No se pudo abrir la cámara. Si abriste el enlace desde WhatsApp, ábrelo en Chrome o Safari y concede el permiso de cámara. También puedes usar la pistola o el modo manual."
        );
      }
    })();
    return () => {
      const i = html5Ref.current;
      html5Ref.current = null;
      if (i) { i.stop().then(() => i?.clear()).catch(() => {}); }
    };
  }, [camOpen, guardar]);

  const etiqueta = origen === "INVERSIONES" ? "TAT Inversiones" : "TAT Agropecuaria";

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2 sm:p-3">
        <div className="flex max-h-[95vh] w-[99vw] max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#eceef0] px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[#14352a]">Leer factura · {etiqueta}</h3>
              <p className="truncate text-xs text-[#7a8794]">Pistola QR, cámara o manual.</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-1.5 text-[#7a8794] hover:bg-[#f4f6f3]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="nice-scroll min-h-0 flex-1 overflow-auto p-4">
            {/* Estado de la pistola: espera de lectura / consultando */}
            <div className="rounded-xl border border-[#2f8f4e]/30 bg-[#f7faf5] p-4 text-center">
              {buscando ? (
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#2f8f4e]">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  Consultando factura…
                </p>
              ) : (
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#2f8f4e]">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#2f8f4e] [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#2f8f4e] [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#2f8f4e]" />
                  </span>
                  Esperando lectura de la pistola…
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-[#7a8794]">Dispara la pistola sobre el QR; se lee y busca automáticamente.</p>
              {ultima && !buscando && (
                <p className="mt-1 text-xs font-medium text-[#14352a]">Última: {ultima} ✓</p>
              )}
            </div>

            {/* Cámara */}
            <button
              onClick={() => {
                if (esNavegadorInApp()) {
                  setError("Abriste el enlace dentro de WhatsApp. Toca el menú (•••) y elige \"Abrir en el navegador\" (Chrome o Safari) para usar la cámara.");
                  return;
                }
                setError(null);
                setCamOpen(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              Escanear con cámara
            </button>

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
            <button onClick={onClose} className="rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42]">
              Listo
            </button>
          </div>
        </div>
      </div>

      {/* Modal de cámara en tiempo real */}
      {camOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black">
          <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">Encuadra el QR de la factura</span>
            <button onClick={() => setCamOpen(false)} aria-label="Cerrar cámara" className="rounded-lg p-1.5 hover:bg-white/10">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div id="factura-qr-reader" className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          </div>
          <div className="shrink-0 px-4 py-4 text-center text-white">
            {camError ? (
              <p className="mx-auto max-w-sm rounded-lg bg-[#b3261e]/90 px-3 py-2 text-sm">{camError}</p>
            ) : buscando ? (
              <p className="text-sm font-medium text-[#8fd6a4]">Consultando factura…</p>
            ) : ultima ? (
              <p className="text-sm">Última: <span className="font-semibold">{ultima}</span> ✓ — puedes escanear otra</p>
            ) : (
              <p className="text-sm text-white/80">Apunta al QR; se lee automáticamente.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
