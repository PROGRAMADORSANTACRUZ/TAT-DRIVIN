// Migración completa del maestro de Clientes (tabla Cliente = Distribución/Grandes
// Superficies) a partir de DOS archivos:
//   1) grandes-superficies-clientes.xlsx -> hoja "Direcciones": export real de
//      Drivin (formato oficial que Distrilog debe aceptar/soltar).
//   2) tat-clientes.xlsm -> hoja "Clientes": maestro TAT (Nit_Cedula, Nombre,
//      Direccion, Referencia, Barrio, Ciudad, Teléfono, Punto de Venta),
//      convertido al MISMO esquema que el archivo de Grandes Superficies.
//
// Pasos: 1) backup completo de Cliente a JSON con timestamp, 2) parseo de ambos
// archivos, 3) inferencia de Región (departamento) para TAT a partir de Ciudad,
// 4) preserva consecutivos/activo de la BD actual por código (no rompe rutas ya
// asignadas), 5) reemplaza la tabla completa en una transacción, 6) reporte.
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const GS_PATH = "c:\\Users\\molin\\OneDrive\\Desktop\\SANTA CRUZ PROJECTS\\grandes-superficies-clientes.xlsx";
const TAT_PATH = "c:\\Users\\molin\\OneDrive\\Desktop\\SANTA CRUZ PROJECTS\\tat-clientes.xlsm";

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface ClienteData {
  codigoDireccion: string | null;
  nombreDireccion: string | null;
  cliente: string | null;
  tipoDireccion: string | null;
  direccion: string | null;
  referencia: string | null;
  descripcion: string | null;
  comuna: string | null;
  provincia: string | null;
  region: string | null;
  pais: string | null;
  codigoPostal: string | null;
  lat: string | null;
  lon: string | null;
  barrio: string | null;
  manzana: string | null;
  lote: string | null;
  tipoVia: string | null;
  telefono: string | null;
  correo: string | null;
  puntoVenta: string | null;
  tipo: string;
  vendedor: string | null;
}

// ── Municipios de Colombia por departamento (copia de frontend/src/data/colombia.ts) ──
// Se usa solo para inferir Región (departamento) de los clientes TAT a partir de Ciudad.
const MUNICIPIOS_POR_DEPARTAMENTO: Record<string, string[]> = {
  "Atlántico": ["Barranquilla", "Soledad", "Malambo", "Sabanalarga", "Baranoa", "Puerto Colombia", "Galapa", "Sabanagrande", "Santo Tomás", "Palmar de Varela", "Ponedera", "Polonuevo", "Usiacurí", "Juan de Acosta", "Tubará", "Piojó", "Luruaco", "Repelón", "Manatí", "Candelaria", "Campo de la Cruz", "Santa Lucía", "Suan"],
  "Bolívar": ["Cartagena", "Magangué", "Turbaco", "Arjona", "El Carmen de Bolívar", "Mompós", "Santa Rosa", "Turbaná", "San Juan Nepomuceno", "María la Baja", "San Jacinto", "Mahates", "Villanueva", "Santa Catalina", "Clemencia", "Santa Rosa del Sur", "Simití", "San Pablo", "Morales", "Arenal", "Achí", "San Martín de Loba", "Barranco de Loba", "Altos del Rosario", "Regidor", "Río Viejo", "Tiquisio", "Montecristo", "Pinillos", "Talaigua Nuevo", "Cicuco", "San Fernando", "Margarita", "Hatillo de Loba", "El Peñón", "Norosí", "Cantagallo", "Calamar", "El Guamo", "Zambrano", "Córdoba", "San Estanislao", "Soplaviento", "Arroyohondo"],
  "Córdoba": ["Montería", "Cereté", "Lorica", "Sahagún", "Planeta Rica", "Montelíbano", "Tierralta", "Ciénaga de Oro", "Chinú", "San Andrés de Sotavento", "San Pelayo", "Puerto Libertador", "Ayapel", "Pueblo Nuevo", "San Antero", "Los Córdobas", "Canalete", "Moñitos", "San Bernardo del Viento", "Purísima", "Momil", "Chimá", "Cotorra", "Valencia", "Tuchín", "La Apartada", "Buenavista", "San Carlos", "San José de Uré", "Puerto Escondido"],
  "Sucre": ["Sincelejo", "Corozal", "Sampués", "San Marcos", "Santiago de Tolú", "Sincé", "San Onofre", "Majagual", "Coveñas", "Ovejas", "Los Palmitos", "Morroa", "San Benito Abad", "Galeras", "San Pedro", "Buenavista", "Sucre", "Caimito", "La Unión", "El Roble", "Guaranda", "San Juan de Betulia", "Chalán", "Colosó", "Palmito", "Tolú Viejo"],
  "Magdalena": ["Santa Marta", "Ciénaga", "Fundación", "El Banco", "Plato", "Aracataca", "Zona Bananera", "Pivijay", "El Retén", "Algarrobo", "Ariguaní", "Sabanas de San Ángel", "Nueva Granada", "Pedraza", "Chivolo", "Tenerife", "Guamal", "San Sebastián de Buenavista", "Santa Ana", "Pijiño del Carmen", "San Zenón", "Santa Bárbara de Pinto", "Cerro de San Antonio", "Concordia", "Pueblo Viejo", "Sitionuevo", "Remolino", "Salamina", "El Piñón", "Zapayán"],
  "Cesar": ["Valledupar", "Aguachica", "Bosconia", "Agustín Codazzi", "La Jagua de Ibirico", "Chiriguaná", "El Copey", "Curumaní", "San Alberto", "San Martín", "Pailitas", "Becerril", "La Paz", "Manaure Balcón del Cesar", "Pelaya", "Astrea", "El Paso", "Gamarra", "González", "Río de Oro", "La Gloria", "Tamalameque", "Pueblo Bello", "San Diego"],
  "La Guajira": ["Riohacha", "Maicao", "Uribia", "Manaure", "Fonseca", "San Juan del Cesar", "Villanueva", "Barrancas", "Dibulla", "Hatonuevo", "Albania", "El Molino", "Distracción", "La Jagua del Pilar", "Urumita"],
  "Bogotá D.C.": ["Bogotá"],
  "Cundinamarca": ["Soacha", "Facatativá", "Zipaquirá", "Chía", "Girardot", "Fusagasugá", "Mosquera", "Madrid", "Funza", "Cajicá", "Sibaté", "Tocancipá", "Cota", "La Calera", "Ubaté", "Villeta", "Cáqueza", "Choachí", "Tenjo", "Tabio", "Sopó", "Gachetá", "Guaduas", "La Mesa", "Anapoima", "Ricaurte", "Pacho", "Nemocón", "Sesquilé", "Gachancipá", "Sasaima", "Silvania", "Tocaima", "Villapinzón", "Chocontá", "Zipacón", "El Rosal", "Bojacá", "Subachoque", "Suesca", "Guasca", "Fómeque", "Une", "Gutiérrez", "Agua de Dios", "Nilo", "Viotá", "El Colegio", "San Antonio del Tequendama", "Cachipay", "Apulo", "Nariño", "Jerusalén", "Fúquene", "Lenguazaque", "Guachetá", "Simijaca", "Tausa"],
  "Antioquia": ["Medellín", "Bello", "Itagüí", "Envigado", "Apartadó", "Turbo", "Rionegro", "Sabaneta", "Copacabana", "La Estrella", "Caucasia", "Girardota", "Barbosa", "Marinilla", "Carepa", "El Bagre", "Chigorodó", "Necoclí", "Yarumal", "Santa Rosa de Osos", "Sonsón", "Puerto Berrío", "Caldas", "La Ceja", "Guarne", "El Carmen de Viboral", "Segovia", "Amagá", "Andes", "Santa Fe de Antioquia", "Támesis", "Jericó", "Jardín", "Ciudad Bolívar", "Urrao", "Frontino", "Dabeiba", "Cañasgordas", "Sopetrán", "San Jerónimo", "El Peñol", "Guatapé", "San Rafael", "San Carlos", "Cocorná", "Granada", "El Santuario", "La Unión", "Abejorral", "Yolombó", "Cisneros", "Santo Domingo", "Remedios", "Zaragoza", "Nechí", "Tarazá", "Valdivia", "Ituango", "Don Matías", "Entrerríos", "San Pedro de los Milagros", "Puerto Triunfo", "Puerto Nare", "Maceo", "Titiribí", "Fredonia", "Venecia", "Concordia"],
  "Valle del Cauca": ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago", "Buga", "Jamundí", "Yumbo", "Florida", "Candelaria", "Pradera", "Zarzal", "Sevilla", "Roldanillo", "La Unión", "Caicedonia", "El Cerrito", "Guacarí", "Ginebra", "Dagua", "Andalucía", "Bugalagrande", "Restrepo", "Vijes", "Yotoco", "La Cumbre", "Calima", "Riofrío", "Trujillo", "Bolívar", "El Dovio", "Versalles", "El Águila", "El Cairo", "Argelia", "Toro", "Ansermanuevo", "Alcalá", "Ulloa", "Obando", "La Victoria"],
  "Santander": ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil", "Socorro", "Barbosa", "Málaga", "Vélez", "Lebrija", "Rionegro", "Sabana de Torres", "Puerto Wilches", "Cimitarra", "Zapatoca", "Charalá", "Oiba", "El Playón", "San Vicente de Chucurí", "El Carmen de Chucurí", "Curití", "Aratoca", "Los Santos", "Mogotes", "Onzaga", "San Joaquín", "Barichara", "Villanueva", "Puente Nacional", "Guavatá", "Bolívar", "Landázuri", "Suaita", "Contratación", "Simacota", "Concepción", "Cerrito", "California", "Matanza", "Suratá", "Tona", "Los Patios", "Aguada", "Guaca"],
  "Norte de Santander": ["Cúcuta", "Villa del Rosario", "Los Patios", "Ocaña", "Pamplona", "Tibú", "El Zulia", "Chinácota", "Sardinata", "Ábrego", "Puerto Santander", "El Tarra", "Convención", "San Cayetano", "El Carmen", "Teorama", "Hacarí", "La Playa", "San Calixto", "Bochalema", "Pamplonita", "Cácota", "Chitagá", "Toledo", "Labateca", "Ragonvalia", "Herrán", "Durania", "Salazar", "Arboledas", "Cucutilla", "Gramalote", "Lourdes", "Villa Caro", "Bucarasica", "Mutiscua", "Silos", "Cachirá", "La Esperanza"],
  "Nariño": ["Pasto", "Ipiales", "Tumaco", "Túquerres", "La Unión", "Samaniego", "Sandoná", "Barbacoas", "El Charco", "Cumbal", "Pupiales", "Guachucal", "La Cruz", "Buesaco", "Tangua", "Yacuanquer", "Consacá", "Ancuya", "Linares", "El Tambo", "Chachagüí", "La Florida", "Nariño", "Ospina", "Imués", "Iles", "Contadero", "Aldana", "Córdoba", "Potosí", "Puerres", "Funes", "Ricaurte", "Mallama", "Providencia", "Sapuyes", "Guaitarilla", "El Peñol", "Taminango", "San Lorenzo", "Arboleda", "San Pablo", "Belén", "Colón", "La Llanada", "Los Andes", "Cumbitara", "El Rosario", "Leiva", "Policarpa", "Magüí", "Roberto Payán", "Olaya Herrera", "Mosquera", "La Tola", "Santa Bárbara"],
  "Huila": ["Neiva", "Pitalito", "Garzón", "La Plata", "Campoalegre", "Gigante", "Palermo", "Aipe", "Rivera", "San Agustín", "Timaná", "Acevedo", "Algeciras", "Isnos", "Tello"],
  "Boyacá": ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá", "Paipa", "Puerto Boyacá", "Villa de Leyva", "Moniquirá", "Nobsa", "Samacá", "Tibasosa", "Garagoa", "Ramiriquí", "Soatá", "Guateque", "Aquitania", "Tibaná", "Ventaquemada", "Combita", "Motavita", "Oicatá", "Sora", "Cucaita", "Sotaquirá", "Toca", "Siachoque", "Turmequé", "Nuevo Colón", "Jenesano", "Boyacá", "Cerinza", "Belén", "Santa Rosa de Viterbo", "Floresta", "Busbanzá", "Corrales", "Gañeza", "Firavitoba", "Iza", "Cuítiva", "Tota", "Monguí", "Mongua", "Sativanorte", "Susacón", "Tipacoque", "Covarachía", "Chita", "Jericó", "Socha", "Socotá", "Tasco", "Paz de Río", "Betéitiva", "Miraflores", "Chinavita", "Pachavita", "Macanal", "Campohermoso", "Guayatá", "Tenza", "La Capilla", "Sutatenza", "Somondoco", "Almeida", "Chivor", "Ciénega", "Viácha"],
  "Meta": ["Villavicencio", "Acacías", "Granada", "Puerto López", "San Martín", "Cumaral", "Restrepo", "Puerto Gaitán", "Guamal", "Castilla la Nueva", "San Carlos de Guaroa", "Fuente de Oro", "El Castillo", "El Dorado", "Cubarral", "Lejanías", "El Calvario", "San Juanito", "Barranca de Upía", "Cabuyaro", "San Juan de Arama", "Vistahermosa", "Mesetas", "Uribe", "La Macarena", "Puerto Rico", "Puerto Concordia", "Puerto Lleras", "Mapiripán", "Cacaimen", "El Rosario"],
  "Cauca": ["Popayán", "Santander de Quilichao", "Puerto Tejada", "Patía", "Miranda", "Corinto", "Guapi", "Piendamó", "Caloto", "Timbío", "El Tambo", "Silvia", "Bolívar", "Cajibío", "Villa Rica", "Padilla", "Buenos Aires", "Suárez", "Morales", "Caldono", "Jambaló", "Toribio", "Totoró", "Inzá", "Páez", "Puracé", "Sotará", "La Sierra", "Rosas", "La Vega", "Almaguer", "San Sebastián", "Santa Rosa", "Mercaderes", "Balboa", "Argelia", "López de Micay", "Timbiquí", "Sucre", "Florencia", "Piamonte"],
  "Tolima": ["Ibagué", "Espinal", "Melgar", "Honda", "Líbano", "Chaparral", "Mariquita", "Flandes", "Guamo", "Purificación", "Fresno", "Cajamarca", "Ortega", "Lérida", "Venadillo", "Natagaima", "Coyaima", "Saldaña", "Rovira", "San Luis", "Valle de San Juan", "El Espinal", "Alvarado", "Piedras", "Ambalema", "Armero", "Falan", "Palocabildo", "Casabianca", "Villahermosa", "Murillo", "Santa Isabel", "Anzoátegui", "Roncesvalles", "San Antonio", "Planadas", "Rioblanco", "Atáco", "Coello", "Suarez", "Prado", "Dolores", "Alpujarra", "Cunday", "Villarrica", "Icononzo", "Carmen de Apicalá"],
  "Caldas": ["Manizales", "La Dorada", "Chinchiná", "Villamaría", "Riosucio", "Anserma", "Supía", "Neira", "Aguadas", "Salamina", "Pácora", "Manzanares", "Pensilvania", "Aranzazu"],
  "Risaralda": ["Pereira", "Dosquebradas", "Santa Rosa de Cabal", "La Virginia", "Marsella", "Belén de Umbría", "Quinchía", "Apía", "Santuario", "La Celia", "Balboa", "Guática", "Mistrató", "Pueblo Rico"],
  "Quindío": ["Armenia", "Calarcá", "La Tebaida", "Montenegro", "Quimbaya", "Circasia", "Filandia", "Salento", "Génova", "Pijao", "Córdoba", "Buenavista"],
  "Caquetá": ["Florencia", "San Vicente del Caguán", "Puerto Rico", "El Doncello", "La Montañita", "El Paujíl", "Cartagena del Chairá", "Belén de los Andaquíes", "Curillo", "Morelia"],
  "Casanare": ["Yopal", "Aguazul", "Villanueva", "Tauramena", "Paz de Ariporo", "Monterrey", "Hato Corozal", "Maní", "Trinidad", "Nunchía", "Pore", "Orocué"],
  "Chocó": ["Quibdó", "Istmina", "Tadó", "Condoto", "Riosucio", "Bahía Solano", "Nuquí", "Acandí", "Unguía", "El Carmen de Atrato", "Bojayá", "Certegui", "Novita"],
  "Putumayo": ["Mocoa", "Puerto Asís", "Orito", "Valle del Guamuez", "Villagarzón", "Puerto Caicedo", "Sibundoy", "San Miguel", "Puerto Guzmán", "Colón", "Santiago"],
  "Arauca": ["Arauca", "Saravena", "Tame", "Arauquita", "Fortul", "Puerto Rondón", "Cravo Norte"],
  "Guaviare": ["San José del Guaviare", "El Retorno", "Calamar", "Miraflores"],
  "Vichada": ["Puerto Carreño", "La Primavera", "Santa Rosalía", "Cumaribo"],
  "Amazonas": ["Leticia", "Puerto Nariño"],
  "Guainía": ["Inírida"],
  "Vaupés": ["Mitú", "Carurú", "Taraira"],
  "San Andrés y Providencia": ["San Andrés", "Providencia"],
};
const CIUDAD_A_DEPTO = new Map<string, string>();
for (const [depto, ciudades] of Object.entries(MUNICIPIOS_POR_DEPARTAMENTO)) {
  for (const c of ciudades) CIUDAD_A_DEPTO.set(norm(c), depto);
}
function departamentoDeCiudad(ciudad: string): string | null {
  return CIUDAD_A_DEPTO.get(norm(ciudad)) ?? null;
}

// ── Parseo del Excel de Grandes Superficies (formato oficial Drivin) ──
const CAMPOS_GS: { key: keyof ClienteData; header: string }[] = [
  { key: "codigoDireccion", header: "Código de Dirección" },
  { key: "nombreDireccion", header: "Nombre de Dirección" },
  { key: "cliente", header: "Cliente" },
  { key: "tipoDireccion", header: "Tipo de Dirección" },
  { key: "direccion", header: "Dirección" },
  { key: "referencia", header: "Referencia" },
  { key: "descripcion", header: "Descripción" },
  { key: "comuna", header: "Comuna" },
  { key: "provincia", header: "Provincia" },
  { key: "region", header: "Región" },
  { key: "pais", header: "País" },
  { key: "codigoPostal", header: "Código Postal" },
  { key: "lat", header: "Lat" },
  { key: "lon", header: "Lon" },
  { key: "telefono", header: "Teléfono" },
  { key: "correo", header: "Correo" },
];

function parseGS(path: string): Map<string, ClienteData> {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  const header = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const { key, header: label } of CAMPOS_GS) idx[key] = header.findIndex((h) => h === norm(label));
  const pick = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  const out = new Map<string, ClienteData>();
  let vacios = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const codigo = pick(r, idx.codigoDireccion);
    if (!codigo) { vacios++; continue; }
    const row: ClienteData = {
      codigoDireccion: codigo,
      nombreDireccion: pick(r, idx.nombreDireccion) || null,
      cliente: pick(r, idx.cliente) || null,
      tipoDireccion: pick(r, idx.tipoDireccion) || null,
      direccion: pick(r, idx.direccion) || null,
      referencia: pick(r, idx.referencia) || null,
      descripcion: pick(r, idx.descripcion) || null,
      comuna: pick(r, idx.comuna) || null,
      provincia: pick(r, idx.provincia) || null,
      region: pick(r, idx.region) || null,
      pais: pick(r, idx.pais) || "Colombia",
      codigoPostal: pick(r, idx.codigoPostal) || null,
      lat: pick(r, idx.lat) || null,
      lon: pick(r, idx.lon) || null,
      barrio: null,
      manzana: null,
      lote: null,
      tipoVia: null,
      telefono: pick(r, idx.telefono) || null,
      correo: pick(r, idx.correo) || null,
      puntoVenta: null,
      tipo: "Distribución",
      vendedor: null,
    };
    const key = norm(codigo);
    out.set(key, row); // último gana si hubiera duplicado (no se detectaron)
  }
  console.log(`GS: ${rows.length - 1} filas leídas, ${vacios} sin código (descartadas), ${out.size} únicas.`);
  return out;
}

// ── Parseo del Excel TAT, convertido al esquema de Grandes Superficies ──
function parseTat(path: string): { data: Map<string, ClienteData>; conBarrio: number; sinBarrio: number; regionInferida: number; sinRegion: number } {
  const wb = XLSX.readFile(path, { bookVBA: false });
  const sheet = wb.Sheets["Clientes"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  const header = rows[0].map(norm);
  const idx = {
    nit: header.findIndex((h) => h === norm("Nit_Cedula")),
    nombre: header.findIndex((h) => h === norm("Nombre")),
    direccion: header.findIndex((h) => h === norm("Direccion")),
    referencia: header.findIndex((h) => h === norm("Referencia")),
    barrio: header.findIndex((h) => h === norm("Barrio")),
    ciudad: header.findIndex((h) => h === norm("Ciudad")),
    telefono: header.findIndex((h) => h === norm("Teléfono")),
    puntoVenta: header.findIndex((h) => h === norm("Punto de Venta")),
  };
  const pick = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  const out = new Map<string, ClienteData>();
  let conBarrio = 0, sinBarrio = 0, regionInferida = 0, sinRegion = 0, sinNit = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const nit = pick(r, idx.nit);
    if (!nit) { sinNit++; continue; }
    const ciudad = pick(r, idx.ciudad);
    const barrio = pick(r, idx.barrio);
    if (barrio) conBarrio++; else sinBarrio++;
    const region = ciudad ? departamentoDeCiudad(ciudad) : null;
    if (region) regionInferida++; else sinRegion++;
    const nombre = pick(r, idx.nombre) || null;
    const row: ClienteData = {
      codigoDireccion: nit,
      nombreDireccion: nombre,
      cliente: nombre,
      tipoDireccion: null,
      direccion: pick(r, idx.direccion) || null,
      referencia: pick(r, idx.referencia) || null,
      descripcion: null,
      comuna: barrio || null, // Comuna = nivel barrio, igual que en el export de Drivin
      provincia: ciudad || null, // Provincia = ciudad, igual que en el export de Drivin
      region: region, // Departamento inferido de la ciudad (Drivin no lo trae en TAT)
      pais: "Colombia", // Siempre Colombia, por instrucción explícita
      codigoPostal: null,
      lat: null,
      lon: null,
      barrio: null,
      manzana: null,
      lote: null,
      tipoVia: null,
      telefono: pick(r, idx.telefono) || null,
      correo: null,
      puntoVenta: pick(r, idx.puntoVenta) || null,
      tipo: "TAT",
      vendedor: null,
    };
    out.set(norm(nit), row);
  }
  console.log(`TAT: ${rows.length - 1} filas leídas, ${sinNit} sin NIT (descartadas), ${out.size} únicas.`);
  console.log(`TAT: barrio presente en ${conBarrio}, ausente en ${sinBarrio} (no se pudo inferir sin geocodificación).`);
  console.log(`TAT: región (departamento) inferida para ${regionInferida} desde la ciudad; sin inferir ${sinRegion}.`);
  return { data: out, conBarrio, sinBarrio, regionInferida, sinRegion };
}

async function main() {
  // 1) BACKUP completo de la tabla actual antes de tocar nada.
  const actuales = await prisma.cliente.findMany();
  const stamp = Date.now();
  const backupPath = `scripts/backup-cliente-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(actuales, null, 2), "utf8");
  console.log(`\n[BACKUP] ${actuales.length} clientes actuales respaldados en ${backupPath}`);

  // Índice de consecutivos/activo actuales por código (para no perder rutas ya asignadas).
  const previoPorCodigo = new Map<string, { consecutivos: string | null; activo: boolean }>();
  for (const c of actuales) {
    if (c.codigoDireccion) previoPorCodigo.set(norm(c.codigoDireccion), { consecutivos: c.consecutivos, activo: c.activo });
  }

  // 2) Parseo de ambos archivos.
  console.log("\n[PARSEO]");
  const gs = parseGS(GS_PATH);
  const tat = parseTat(TAT_PATH);

  // 3) Colisiones de código entre GS y TAT: gana GS (maestro oficial de Drivin).
  const colisiones: { codigo: string; gs: string | null; tatDescartado: string | null }[] = [];
  for (const [key, row] of tat.data) {
    if (gs.has(key)) {
      colisiones.push({ codigo: key, gs: gs.get(key)!.cliente, tatDescartado: row.cliente });
      tat.data.delete(key);
    }
  }
  console.log(`\n[COLISIONES] ${colisiones.length} código(s) coinciden entre GS y TAT; se conserva la versión GS:`);
  for (const c of colisiones) console.log(`  - ${c.codigo}: GS="${c.gs}" (conservado) vs TAT="${c.tatDescartado}" (descartado)`);

  // 4) Merge final + preserva consecutivos/activo de la BD actual por código.
  const final: (ClienteData & { consecutivos: string; activo: boolean })[] = [];
  let preservados = 0;
  for (const [key, row] of [...gs, ...tat.data]) {
    const prev = previoPorCodigo.get(key);
    if (prev) preservados++;
    final.push({
      ...row,
      consecutivos: prev?.consecutivos ?? "[]",
      activo: prev?.activo ?? true,
    });
  }

  console.log(`\n[MERGE] Total final: ${final.length} clientes (${gs.size} GS + ${tat.data.size} TAT tras quitar colisiones).`);
  console.log(`[MERGE] Consecutivos/activo preservados de la BD anterior en ${preservados} clientes (mismo código).`);

  if (process.env.CONFIRM !== "SI") {
    console.log("\n[DRY-RUN] CONFIRM != 'SI': no se escribió nada en la base de datos.");
    console.log("Ejemplo de 3 filas finales (GS):", JSON.stringify(final.slice(0, 3), null, 2));
    console.log("Ejemplo de 3 filas finales (TAT):", JSON.stringify(final.slice(gs.size, gs.size + 3), null, 2));
    return;
  }

  // 5) Reemplazo completo en una transacción.
  const [{ count: eliminados }, creados] = await prisma.$transaction([
    prisma.cliente.deleteMany(),
    prisma.cliente.createMany({ data: final as never }),
  ]);

  const totalFinal = await prisma.cliente.count();
  const totalTat = await prisma.clienteTat.count();
  console.log(`\n[RESULTADO]`);
  console.log(`Clientes eliminados (versión anterior): ${eliminados}`);
  console.log(`Clientes creados: ${creados.count}`);
  console.log(`Total en tabla Cliente ahora: ${totalFinal}`);
  console.log(`ClienteTat (tabla separada, intacta): ${totalTat}`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
