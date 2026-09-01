// Genera el documento PDF de una Novedad de nivel de servicio (para imprimir/guardar).
import type { Novedad } from "@/lib/api";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function docNovedad(n: Novedad): string {
  const fila = (label: string, valor: string) => `
    <tr>
      <td class="b" style="width:32%">${esc(label)}</td>
      <td>${esc(valor) || "—"}</td>
    </tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Novedad ${n.consecutivo}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #14352a; margin: 0; padding: 28px; }
    .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #2f8f4e; padding-bottom: 12px; margin-bottom: 16px; }
    .head img { width: 60px; height: 60px; object-fit: contain; }
    .head h1 { margin: 0; font-size: 18px; }
    .head p { margin: 2px 0 0; font-size: 11px; color: #5f7a68; }
    .meta { text-align: right; margin-left: auto; font-size: 11px; color: #5f7a68; }
    .badge { display: inline-block; border-radius: 6px; padding: 3px 10px; font-weight: bold; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    td { border: 1px solid #d9e2dc; padding: 7px 10px; vertical-align: top; }
    .b { font-weight: bold; background: #f2f8ef; }
    .sec { font-size: 12px; font-weight: bold; color: #14352a; margin: 4px 0 6px; }
    .box { border: 1px solid #d9e2dc; border-radius: 8px; padding: 12px; min-height: 70px; font-size: 11px; }
    .firma { margin-top: 40px; display: flex; justify-content: space-between; gap: 40px; }
    .firma div { flex: 1; text-align: center; border-top: 1px solid #14352a; padding-top: 4px; font-size: 10px; }
    @media print { body { padding: 0; } }
  </style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},300)">
    <div class="head">
      <img src="/logo.png" alt="Santacruz"/>
      <div>
        <h1>Reporte de Novedad — Nivel de Servicio</h1>
        <p>Agropecuaria Santacruz Ltda.</p>
      </div>
      <div class="meta">
        <div><b>No.</b> RN-${String(n.consecutivo).padStart(5, "0")}</div>
        <div>${esc(fechaLarga(n.createdAt))}</div>
      </div>
    </div>

    <div class="sec">Datos de la novedad</div>
    <table>
      ${fila("Estado de entrega", n.estadoEntrega ?? "")}
      ${fila("Tipo de novedad", n.novedad ?? "")}
      ${fila("Responsabilidad", n.responsabilidad ?? "")}
      ${fila("Fecha del evento", n.fecha)}
      ${fila("Placa / Vehículo", n.placa ?? "")}
      ${fila("Conductor", n.conductor ?? "")}
      ${fila("Auxiliar de ruta", n.auxiliarRuta ?? "")}
      ${fila("Cliente / Destino", n.cliente ?? "")}
      ${fila("No. documento / orden", n.numeroOrden ?? "")}
      ${fila("Plan (DL)", n.planillaId ? `DL-${String(n.consecutivo).padStart(5,"0")}` : "")}
    </table>

    <div class="sec">Descripción / Detalles</div>
    <div class="box">${esc(n.descripcion) || "—"}</div>

    <div class="sec" style="margin-top:14px">Resolución</div>
    <div class="box">${esc(n.resolucion ?? "") || "—"}${
      n.resueltaAt ? `<br/><br/><b>Resuelta el:</b> ${esc(fechaLarga(n.resueltaAt))}` : ""
    }</div>

    <div class="firma">
      <div>Reporta</div>
      <div>Responsable de servicio</div>
    </div>
  </body></html>`;
}

export function imprimirNovedad(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
