// Genera los 2 documentos de la Planilla de Despacho (R.I y R.I.T) en HTML,
// replicando el formato F-SST-012 de Agropecuaria Santacruz para imprimir/PDF.
import type { Planilla, PlanillaItem } from "@/lib/api";
import { AUXILIARES, RUTAS } from "@/data/planillaConfig";

const fmtKg = (n: number) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const fmtKgInt = (n: number) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function telAuxiliar(nombre: string | null): string {
  if (!nombre) return "";
  const a = AUXILIARES.find((x) => x.nombre === nombre);
  return a?.telefono ?? "";
}

function rutaMeta(ruta: string | null) {
  return RUTAS.find((r) => r.nombre === ruta) ?? null;
}

function fechaCorta(fecha: string): string {
  // fecha viene "aaaa-mm-dd"; se muestra dd/mm/aaaa.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : fecha;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Normaliza el tiempo de recorrido a "1 h 15 min" (espacio entre número y unidad).
function fmtTiempo(t: string | null): string {
  return (t ?? "")
    .replace(/(\d)\s*h/i, "$1 h")
    .replace(/(\d)\s*min/i, "$1 min")
    .replace(/\s+/g, " ")
    .trim();
}

// "Fecha y Hora de llegada" = fecha de despacho + hora de salida + tiempo de la
// ruta, con formato dd/mm/aaaa hh:mm (idéntico al SIGLOG). Si falta la hora o el
// tiempo, cae a solo la fecha con ceros.
function fechaHoraLlegada(
  fecha: string,
  horaSalida: string | null,
  tiempo: string | null
): string {
  const md = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!md) return fecha;
  const fechaZero = `${md[3]}/${md[2]}/${md[1]}`;
  const hm = /(\d{1,2}):(\d{2})/.exec((horaSalida ?? "").trim());
  if (!hm) return fechaZero;
  const d = new Date(
    Number(md[1]),
    Number(md[2]) - 1,
    Number(md[3]),
    Number(hm[1]),
    Number(hm[2])
  );
  const th = /(\d+)\s*h/i.exec(tiempo ?? "");
  const tm = /(\d+)\s*m/i.exec(tiempo ?? "");
  d.setMinutes(d.getMinutes() + (th ? Number(th[1]) * 60 : 0) + (tm ? Number(tm[1]) : 0));
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; margin: 0; padding: 10px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; word-wrap: break-word; }
  .noborder, .noborder > tbody > tr > td, .noborder > tbody > tr > th { border: none; }
  .center { text-align: center; }
  .right { text-align: right; }
  .b { font-weight: bold; }
  .title { font-size: 12px; font-weight: bold; text-align: center; line-height: 1.15; }
  .sub { font-size: 9px; font-weight: bold; text-align: center; }
  .hdr { font-weight: bold; text-align: center; }
  .sec { background: #d9d9d9; font-weight: bold; text-align: center; }
  .sm { font-size: 7px; line-height: 1.25; }
  .xs { font-size: 6px; line-height: 1.2; }
  .chk { display: inline-block; width: 7px; height: 7px; border: 1px solid #000; vertical-align: middle; margin-left: 2px; }
  .vert { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: -1px; font-size: 7px; font-weight: bold; text-align: center; width: 13px; padding: 2px 0; }
  .logo { display: block; width: 100%; max-width: 145px; height: auto; margin: 0 auto; }
  @media print { body { padding: 0; } .page { page-break-after: always; } }
`;

function encabezado(p: Planilla): string {
  return `
  <table>
    <tr>
      <td style="width:17%" class="center"><img src="/logo.png" class="logo" alt="Agropecuaria Santacruz"/></td>
      <td class="title">PLANIFICACION DE DESPLAZAMIENTOS LABORALES<br/><span class="sub">AGROPECUARIA SANTACRUZ</span></td>
      <td style="width:20%" class="sm">
        Código: F-SST-012<br/>
        Fecha de versión: 07 de marzo 2024<br/>
        Versión: 1<br/>
        Página: 1 de 1
      </td>
    </tr>
  </table>
  <table style="margin-top:3px">
    <tr>
      <td class="b" style="width:17%">Fecha de Despacho:</td>
      <td class="center" style="width:33%">${esc(fechaCorta(p.fecha))}</td>
      <td class="b" style="width:17%">Consecutivo No.</td>
      <td class="center b">${String(p.consecutivo).padStart(5, "0")}</td>
    </tr>
  </table>`;
}

function filasItems(items: PlanillaItem[]): string {
  return items
    .map(
      (it) => `
      <tr>
        <td class="center">${esc(it.numeroOrden)}</td>
        <td class="sm b">${esc(it.codigoArea || `${it.cliente}-${it.destino}`)}</td>
        <td class="center">${esc(it.area || "")}</td>
        <td>${esc(it.nombreDestino || it.destino)}</td>
        <td>${esc(it.direccion || "")}</td>
        <td class="right">${fmtKg(it.kg)}</td>
      </tr>`
    )
    .join("");
}

// Documento 1: R.I — control y retorno de documentos.
export function docRI(p: Planilla): string {
  const tel = telAuxiliar(p.auxiliarRuta);
  return `<!doctype html><html><head><meta charset="utf-8"><title>R.I ${p.consecutivo}</title><style>${CSS}</style></head><body onload="setTimeout(function(){window.focus();window.print();},350)">
  <div class="page">
  ${encabezado(p)}
  <table style="margin-top:3px">
    <tr class="hdr"><td style="width:10%">PLACA</td><td>NOMBRE DEL CONDUCTOR</td><td style="width:14%">TELEFONO</td><td>NOMBRE DEL AUXILIAR</td><td style="width:14%">TELEFONO</td></tr>
    <tr>
      <td class="center b">${esc(p.placa)}</td>
      <td>${esc(p.conductor || "")}</td>
      <td class="center">${esc(tel)}</td>
      <td>${esc(p.auxiliarRuta || "")}</td>
      <td class="center"></td>
    </tr>
  </table>
  <table>
    <tr>
      <td class="b" style="width:16%">Inicio Cargue:</td><td style="width:17%"></td>
      <td class="b" style="width:20%">Temp °C Inicio del Cargue:</td><td style="width:13%"></td>
      <td class="b" style="width:17%">Kilómetros Inicial:</td><td></td>
    </tr>
    <tr>
      <td class="b">Final Cargue:</td><td></td>
      <td class="b">Temp °C Fin del Cargue:</td><td></td>
      <td class="b">Kilómetros Retorno:</td><td></td>
    </tr>
  </table>
  <table style="margin-top:3px">
    <tr class="sec"><td>PROCEDIMIENTO DE CONTROL Y RETORNO DE DOCUMENTOS</td></tr>
  </table>
  <table>
    <tr class="sm" style="vertical-align:top">
      <td style="width:50%">
        <b>1-</b> Antes de salir de Planta a ruta, revisar el numero total de documentos recibidos.<br/>
        <b>2-</b> Al entregar en los PDV revisar que les devuelvan el total de documentos entregados, firmados y sellados.
      </td>
      <td>
        <b>3-</b> Si hay devolución se debe entregar al área indicada y hacer firmar la planilla de recibido del documento.<br/>
        <b>4-</b> Los documentos se deben entregar en su totalidad a la persona encargada y mostrarle los que tienen dinero por cancelar.
      </td>
    </tr>
  </table>
  <table style="margin-top:3px">
    <tr class="hdr">
      <td style="width:8%">No. DOCTO.</td>
      <td style="width:16%">CODIGO</td>
      <td style="width:8%">ÁREA</td>
      <td style="width:20%">NOMBRE DEL DESTINO</td>
      <td>DIRECCION</td>
      <td style="width:8%">KILOS</td>
    </tr>
    ${filasItems(p.items)}
    <tr class="b">
      <td class="right">TOTAL DOC/TOS:</td>
      <td class="center">${p.docs}</td>
      <td colspan="2"></td>
      <td class="right">TOTAL KILOS</td>
      <td class="right">${fmtKgInt(p.kilos)}</td>
    </tr>
  </table>

  <table style="margin-top:4px">
    <tr class="sec"><td>RECOMENDACIONES EN RUTA</td></tr>
  </table>
  <table>
    <tr class="xs" style="vertical-align:top">
      <td style="width:33%">
        <b>EN VIAS DESTAPADAS Y CARRETEABLES:</b><br/>
        1. No sobrepase la velocidad de 30 km/h.<br/>
        2. Evite adelantar vehículos ya que se reduce la visibilidad por el levantamiento de material particulado.<br/>
        3. No se orille demasiado puede encunetarse o volcarse.<br/>
        <b>EN VIAS NACIONALES:</b><br/>
        1. Mantenga una mirada lejana para tener una vista panorámica.<br/>
        2. Respete la velocidad recomendada en los diferentes tramos de la vía.<br/>
        3. No se estacione en puentes.<br/>
        4. Mantenga una distancia mínima de 25 mts con otros vehículos.
      </td>
      <td style="width:34%">
        <b>EN PRESENCIA DE CURVA:</b><br/>
        1. Reduzca la velocidad antes de tomar las curvas.<br/>
        2. En descensos no recaliente los frenos utilice el freno de motor.<br/>
        3. Procure no tomar las curvas ni tan abiertas, ni tan cerradas; los grados de inclinación y el movimiento de los líquidos pueden causar volcamiento.<br/>
        4. No realice maniobras de adelantamiento.<br/>
        5. Mueva los ojos permanentemente para evitar dormirse.<br/>
        6. Este atento a la salida e ingreso de vehículos.<br/>
        7. Revise los espejos retrovisores.<br/>
        8. Informe con anticipación sus intenciones de girar o adelantar.
      </td>
      <td>
        <b>EN ZONAS URBANAS:</b><br/>
        1. Reduzca la velocidad.<br/>
        2. Respete los cruces peatonales y señales de tránsito.<br/>
        3. Ceda el paso.<br/>
        4. Utilice las señales luminosas y sonoras para avisar sus movimientos.<br/>
        5. No parquee en zona urbana.
      </td>
    </tr>
  </table>
  </div>

  <div class="page">
  <table>
    <tr class="sec"><td style="width:50%">VELOCIDADES SEGURAS DE DESPLAZAMIENTO</td><td>PUNTOS CRITICOS DE LA RUTA</td></tr>
  </table>
  <table class="noborder"><tr>
    <td style="width:50%; vertical-align:top; padding:0 3px 0 0">
      <table>
        <tr><td class="b" style="width:62%">En vías destapadas</td><td class="center">30 Km/h</td></tr>
        <tr><td class="b">En vías pavimentadas</td><td class="center">80 Km/h</td></tr>
        <tr><td class="b">Áreas Urbanas</td><td class="center">50 Km/h</td></tr>
        <tr><td class="b">Zona Escolar</td><td class="center">20 Km/h</td></tr>
        <tr><td class="b">Descensos Peligrosos</td><td class="center">20 Km/h</td></tr>
      </table>
    </td>
    <td style="vertical-align:top; padding:0 0 0 3px">
      <table>
        <tr class="sec"><td>DESCRIPCION DE LA VIA (deslizamientos, Orden Publico, trancones, entre otros)</td></tr>
        <tr><td style="height:16px"></td></tr>
        <tr><td style="height:16px"></td></tr>
        <tr><td style="height:16px"></td></tr>
        <tr><td style="height:16px"></td></tr>
      </table>
    </td>
  </tr></table>
  <table style="margin-top:4px">
    <tr class="sec"><td style="width:50%">DIRECTORIO TELEFONICO EN CASO DE EMERGENCIA</td><td>NOMBRE Y SELLO QUIEN DESPACHA</td></tr>
  </table>
  <table class="noborder"><tr>
    <td style="width:50%; vertical-align:top; padding:0 3px 0 0">
      <table class="sm">
        <tr><td>ARL Sura - 01 8000 51 888</td><td>Policía Carreteras - 126</td></tr>
        <tr><td>Emergencias - 123</td><td>Policía - 112</td></tr>
        <tr><td>Ambulancias - 125</td><td>Gaula - 147</td></tr>
        <tr><td>Bombero - 119</td><td>CAI - 156</td></tr>
        <tr><td>Defensa Civil - 144</td><td>Cruz Roja - 132</td></tr>
      </table>
    </td>
    <td style="vertical-align:top; padding:0 0 0 3px">
      <table>
        <tr><td style="height:96px; vertical-align:bottom">
          <div class="center">_____________________<br/>Nombre, Firma y Sello</div>
          <div class="xs" style="margin-top:3px">Confirmo la entrega completa de los PDV y las cantidades descritas en esta planilla la cual consolida el total de los documentos anexos, que fueron certificados al momento de la entrega.</div>
        </td></tr>
      </table>
    </td>
  </tr></table>
  <p class="xs" style="margin-top:5px">Todos los documentos descritos en esta planilla deben ser devueltos a <b>Agropecuaria Santacruz Ltda.</b> para que estos a su vez cancelen los servicios causados por transporte y entrega de mercancía. La no devolución de los documentos o el no recibo de ellos ya sean porque no estén firmados y sellados por el cliente final que recibió, daño o deterioro de facturas, dará lugar a que no sea firmada y sellada la planilla del retorno y que los servicios de transporte, no sean cancelados por parte de <b>Agropecuaria Santacruz Ltda.</b>, hasta que la relación total se halla recibido.</p>
  </div>
  </body></html>`;
}

// Documento 2: R.I.T — tripulación y datos generales de ruta (2 columnas de items).
export function docRIT(p: Planilla): string {
  const tel = telAuxiliar(p.auxiliarRuta);
  const meta = rutaMeta(p.ruta);
  const items = p.items;
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const celda = (it?: PlanillaItem) =>
    it
      ? `<td class="center">${esc(it.numeroOrden)}</td><td class="center"></td><td class="center">${esc(it.area || "")}</td><td>${esc(it.nombreDestino || it.destino)}</td>`
      : `<td></td><td></td><td></td><td></td>`;
  const filasDobles = Array.from({ length: half }, (_, i) => {
    return `<tr>${celda(left[i])}${celda(right[i])}</tr>`;
  }).join("");

  const chk = (t: string) => `${t} <span class="chk"></span>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>R.I.T ${p.consecutivo}</title><style>${CSS}</style></head><body onload="setTimeout(function(){window.focus();window.print();},350)">
  <div class="page">
  ${encabezado(p)}
  <table style="margin-top:3px">
    <tr class="hdr"><td style="width:10%">PLACA</td><td colspan="3">NOMBRES DE LA TRIPULACION</td><td style="width:11%">ORIGEN</td><td style="width:9%">HORA SALIDA</td><td colspan="2">RUTA Y DESTINO</td></tr>
    <tr>
      <td class="center b">${esc(p.placa)}</td>
      <td colspan="3" class="sm">Conductor: ${esc(p.conductor || "")}${tel ? ` Tel. ${esc(tel)}` : ""}<br/>Auxiliar: ${esc(p.auxiliarRuta || "")}</td>
      <td class="center">${esc(p.origen || "")}</td>
      <td class="center">${esc(p.horaSalida || "")}</td>
      <td colspan="2">${esc(p.ruta || "")}</td>
    </tr>
  </table>
  <table style="margin-top:2px">
    <tr class="hdr">
      <td class="vert" rowspan="3">DOTACIÓN</td>
      <td>UNIFORME</td><td>BOTAS</td><td>GORRO</td>
      <td class="vert" rowspan="3">CONDICION LIMPIEZA</td>
      <td>EXTERIOR</td><td>PISO</td><td>CORTINAS</td><td>PAREDES</td><td>ESTIVAS</td><td>TECHO</td><td>OLORES</td>
    </tr>
    <tr class="sm center">
      <td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td>
      <td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td><td>${chk("SC")}</td>
    </tr>
    <tr class="sm center">
      <td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td>
      <td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td><td>${chk("NC")}</td>
    </tr>
  </table>
  <table style="margin-top:2px">
    <tr class="hdr">
      <td style="width:9%">No. DOCTO.</td><td style="width:3%">*</td><td style="width:8%">ÁREA</td><td>NOMBRE DEL DESTINO</td>
      <td style="width:9%">No. DOCTO.</td><td style="width:3%">*</td><td style="width:8%">ÁREA</td><td>NOMBRE DEL DESTINO</td>
    </tr>
    ${filasDobles}
    <tr class="b">
      <td colspan="3" class="center">TOTAL DOCUMENTOS:</td><td class="center">${p.docs}</td>
      <td colspan="3" class="center">TOTAL KILOS:</td><td class="center">${fmtKgInt(p.kilos)}</td>
    </tr>
  </table>

  <table style="margin-top:2px">
    <tr class="hdr"><td style="width:50%">NOMBRE DEL AUXILIAR QUE RECIBE DOCUMENTACION Y MERCANCIA</td><td>NOMBRE Y SELLO QUIEN DESPACHA</td></tr>
    <tr class="xs" style="vertical-align:top">
      <td style="height:66px">Firma:________________<br/><br/>Recibo a conformidad los Puntos de Ventas y las cantidades descritas en esta planilla, la cual consolida el total de los documentos anexos. El costo económico de las diferencias que se presenten al momento del retorno, estarán bajo mi responsabilidad y asumiré de manera solidaria las diferencias que se presenten.</td>
      <td>Firma:________________<br/><br/>Confirmo la entrega completa de los Puntos de Ventas y las cantidades descritas en esta planilla, la cual consolida el total de los documentos anexos, que fueron certificados en presencia del Sr. Transportador al momento de la entrega.</td>
    </tr>
  </table>
  <p class="xs" style="margin:3px 0">Todos los documentos descritos en esta planilla deben ser devueltos a Agropecuaria Santacruz Ltda. para que estos a su vez cancelen los servicios causados por transporte y entrega de mercancía. La no devolución de los documentos o el no recibo de ellos ya sean porque no estén firmados y sellados por el cliente final que recibió, daño o deterioro de facturas, dará lugar a que no sea firmada y sellada la planilla del retorno y que los servicios de transporte, no sean cancelados por parte de Agropecuaria Santacruz Ltda., hasta que la relación total se halla recibido.</p>

  <table>
    <tr class="sec"><td colspan="4">DATOS GENERALES DE LA PLANIFICACION DE RUTA</td></tr>
    <tr><td class="b center" style="width:12%">Verificado</td><td>Guías de Transporte para el Despacho.</td><td class="b" style="width:22%">Kms Recorridos</td><td class="center">${esc(meta?.kls ?? "")}</td></tr>
    <tr><td class="b center">Verificado</td><td>Vigencia Licencia de Conducción.</td><td class="b">Kms Pavimentados</td><td class="center">${esc(meta?.kls ?? "")}</td></tr>
    <tr><td class="b center">Verificado</td><td>Vigencia del SOAT.</td><td class="b">Tiempo del Recorrido</td><td class="center">${esc(fmtTiempo(meta?.tiempo ?? null))}</td></tr>
    <tr><td class="b center">Verificado</td><td>Vigencia Tecnomecanica.</td><td class="b">Fecha y Hora de llegada</td><td class="center">${esc(fechaHoraLlegada(p.fecha, p.horaSalida, meta?.tiempo ?? null))}</td></tr>
    <tr><td class="b center">Verificado</td><td>Vigencia Certificado INVIMA.</td><td class="b">Municipios que Recorre</td><td class="center">${esc(meta?.recorrido ?? "")}</td></tr>
    <tr><td class="b center">Verificado</td><td>Tarjeta de Propiedad Vehiculo.</td><td colspan="2"></td></tr>
    <tr><td class="b center">Verificado</td><td>ARL Impresa de la Tripulacion.</td><td colspan="2"></td></tr>
    <tr><td class="b center">Verificado</td><td>Carnet Impreso Manipulador de Alimentos de Auxiliar.</td><td colspan="2"></td></tr>
  </table>
  <table style="margin-top:2px">
    <tr><td class="b" style="width:8%">YO,</td><td class="b center">${esc(p.conductor || "")}</td><td class="b center" style="width:35%">Firma del Conductor</td></tr>
    <tr><td colspan="2" class="xs" style="height:44px; vertical-align:top">Confirmo haber recibido y leído copia impresa de las recomendaciones dadas para seguir la ruta que me fue asignada y me comprometo a cumplirla. De igual forma confirmo haber certificado preoperacional del vehículo recibido, que se encuentra en óptimas condiciones mecánicas para realizar la ruta.</td><td></td></tr>
  </table>
  </div>
  </body></html>`;
}

// Abre el documento en una ventana nueva; el propio HTML dispara la impresión
// tras cargar el logo (window.print en body onload).
export function imprimirDocumento(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
