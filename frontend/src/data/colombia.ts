// Municipios de Colombia por departamento. Cobertura completa en la región Caribe
// (donde están los clientes) y capitales + principales del resto del país.
export const MUNICIPIOS_POR_DEPARTAMENTO: Record<string, string[]> = {
  "Atlántico": [
    "Barranquilla", "Soledad", "Malambo", "Sabanalarga", "Baranoa", "Puerto Colombia",
    "Galapa", "Sabanagrande", "Santo Tomás", "Palmar de Varela", "Ponedera", "Polonuevo",
    "Usiacurí", "Juan de Acosta", "Tubará", "Piojó", "Luruaco", "Repelón", "Manatí",
    "Candelaria", "Campo de la Cruz", "Santa Lucía", "Suan",
  ],
  "Bolívar": [
    "Cartagena", "Magangué", "Turbaco", "Arjona", "El Carmen de Bolívar", "Mompós",
    "Santa Rosa", "Turbaná", "San Juan Nepomuceno", "María la Baja", "San Jacinto",
    "Mahates", "Villanueva", "Santa Catalina", "Clemencia", "Santa Rosa del Sur",
    "Simití", "San Pablo", "Morales", "Arenal", "Achí", "San Martín de Loba",
    "Barranco de Loba", "Altos del Rosario", "Regidor", "Río Viejo", "Tiquisio",
    "Montecristo", "Pinillos", "Talaigua Nuevo", "Cicuco", "San Fernando",
    "Margarita", "Hatillo de Loba", "El Peñón", "Norosí", "Cantagallo", "Calamar",
    "El Guamo", "Zambrano", "Córdoba", "San Estanislao", "Soplaviento", "Arroyohondo",
  ],
  "Córdoba": [
    "Montería", "Cereté", "Lorica", "Sahagún", "Planeta Rica", "Montelíbano", "Tierralta",
    "Ciénaga de Oro", "Chinú", "San Andrés de Sotavento", "San Pelayo", "Puerto Libertador",
    "Ayapel", "Pueblo Nuevo", "San Antero", "Los Córdobas", "Canalete", "Moñitos",
    "San Bernardo del Viento", "Purísima", "Momil", "Chimá", "Cotorra", "Valencia",
    "Tuchín", "La Apartada", "Buenavista", "San Carlos", "San José de Uré", "Puerto Escondido",
  ],
  "Sucre": [
    "Sincelejo", "Corozal", "Sampués", "San Marcos", "Santiago de Tolú", "Sincé",
    "San Onofre", "Majagual", "Coveñas", "Ovejas", "Los Palmitos", "Morroa", "San Benito Abad",
    "Galeras", "San Pedro", "Buenavista", "Sucre", "Caimito", "La Unión", "El Roble",
    "Guaranda", "San Juan de Betulia", "Chalán", "Colosó", "Palmito", "Tolú Viejo",
  ],
  "Magdalena": [
    "Santa Marta", "Ciénaga", "Fundación", "El Banco", "Plato", "Aracataca", "Zona Bananera",
    "Pivijay", "El Retén", "Algarrobo", "Ariguaní", "Sabanas de San Ángel",
    "Nueva Granada", "Pedraza", "Chivolo", "Tenerife", "Guamal", "San Sebastián de Buenavista",
    "Santa Ana", "Pijiño del Carmen", "San Zenón", "Santa Bárbara de Pinto", "Cerro de San Antonio",
    "Concordia", "Pueblo Viejo", "Sitionuevo", "Remolino", "Salamina", "El Piñón", "Zapayán",
  ],
  "Cesar": [
    "Valledupar", "Aguachica", "Bosconia", "Agustín Codazzi", "La Jagua de Ibirico",
    "Chiriguaná", "El Copey", "Curumaní", "San Alberto", "San Martín", "Pailitas", "Becerril",
    "La Paz", "Manaure Balcón del Cesar", "Pelaya", "Astrea", "El Paso", "Gamarra", "González",
    "Río de Oro", "La Gloria", "Tamalameque", "Pueblo Bello", "San Diego",
  ],
  "La Guajira": [
    "Riohacha", "Maicao", "Uribia", "Manaure", "Fonseca", "San Juan del Cesar", "Villanueva",
    "Barrancas", "Dibulla", "Hatonuevo", "Albania", "El Molino", "Distracción", "La Jagua del Pilar",
    "Urumita",
  ],
  "Bogotá D.C.": ["Bogotá"],
  "Cundinamarca": [
    "Soacha", "Facatativá", "Zipaquirá", "Chía", "Girardot", "Fusagasugá", "Mosquera",
    "Madrid", "Funza", "Cajicá", "Sibaté", "Tocancipá", "Cota", "La Calera", "Ubaté",
    "Villeta", "Cáqueza", "Choachí", "Tenjo", "Tabio", "Sopó", "Gachetá", "Guaduas",
    "La Mesa", "Anapoima", "Ricaurte", "Pacho", "Nemocón", "Sesquilé", "Gachancipá",
    "Sasaima", "Silvania", "Tocaima", "Villapinzón", "Chocontá", "Zipacón", "El Rosal",
    "Bojacá", "Subachoque", "Suesca", "Guasca", "Fómeque", "Une", "Gutiérrez", "Agua de Dios",
    "Nilo", "Viotá", "El Colegio", "San Antonio del Tequendama", "Cachipay", "Apulo",
    "Nariño", "Jerusalén", "Fúquene", "Lenguazaque", "Guachetá", "Simijaca", "Tausa",
  ],
  "Antioquia": [
    "Medellín", "Bello", "Itagüí", "Envigado", "Apartadó", "Turbo", "Rionegro", "Sabaneta",
    "Copacabana", "La Estrella", "Caucasia", "Girardota", "Barbosa", "Marinilla", "Carepa",
    "El Bagre", "Chigorodó", "Necoclí", "Yarumal", "Santa Rosa de Osos", "Sonsón", "Puerto Berrío",
    "Caldas", "La Ceja", "Guarne", "El Carmen de Viboral", "Segovia", "Amagá", "Andes",
    "Santa Fe de Antioquia", "Támesis", "Jericó", "Jardín", "Ciudad Bolívar", "Urrao",
    "Frontino", "Dabeiba", "Cañasgordas", "Sopetrán", "San Jerónimo", "El Peñol", "Guatapé",
    "San Rafael", "San Carlos", "Cocorná", "Granada", "El Santuario", "La Unión", "Abejorral",
    "Yolombó", "Cisneros", "Santo Domingo", "Remedios", "Zaragoza", "Nechí", "Tarazá",
    "Valdivia", "Ituango", "Don Matías", "Entrerríos", "San Pedro de los Milagros", "Bello",
    "Puerto Triunfo", "Puerto Nare", "Maceo", "Titiribí", "Fredonia", "Venecia", "Concordia",
  ],
  "Valle del Cauca": [
    "Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago", "Buga", "Jamundí", "Yumbo",
    "Florida", "Candelaria", "Pradera", "Zarzal", "Sevilla", "Roldanillo", "La Unión",
    "Caicedonia", "El Cerrito", "Guacarí", "Ginebra", "Dagua", "Andalucía", "Bugalagrande",
    "Restrepo", "Vijes", "Yotoco", "La Cumbre", "Calima", "Riofrío", "Trujillo", "Bolívar",
    "El Dovio", "Versalles", "El Águila", "El Cairo", "Argelia", "Toro", "Ansermanuevo",
    "Alcalá", "Ulloa", "Obando", "La Victoria",
  ],
  "Santander": [
    "Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil",
    "Socorro", "Barbosa", "Málaga", "Vélez", "Lebrija", "Rionegro", "Sabana de Torres",
    "Puerto Wilches", "Cimitarra", "Zapatoca", "Charalá", "Oiba", "El Playón", "San Vicente de Chucurí",
    "El Carmen de Chucurí", "Curití", "Aratoca", "Los Santos", "Mogotes", "Onzaga", "San Joaquín",
    "Barichara", "Villanueva", "Puente Nacional", "Guavatá", "Bolívar", "Landázuri", "Suaita",
    "Contratación", "Simacota", "Concepción", "Cerrito", "California", "Matanza", "Suratá",
    "Tona", "Los Patios", "Aguada", "Guaca",
  ],
  "Norte de Santander": [
    "Cúcuta", "Villa del Rosario", "Los Patios", "Ocaña", "Pamplona", "Tibú", "El Zulia",
    "Chinácota", "Sardinata", "Ábrego", "Puerto Santander", "El Tarra", "Convención",
    "San Cayetano", "El Carmen", "Teorama", "Hacarí", "La Playa", "San Calixto", "Bochalema",
    "Pamplonita", "Cácota", "Chitagá", "Toledo", "Labateca", "Ragonvalia", "Herrán", "Durania",
    "Salazar", "Arboledas", "Cucutilla", "Gramalote", "Lourdes", "Villa Caro", "El Zulia",
    "Puerto Santander", "Bucarasica", "Mutiscua", "Silos", "Cachirá", "La Esperanza",
  ],
  "Nariño": [
    "Pasto", "Ipiales", "Tumaco", "Túquerres", "La Unión", "Samaniego", "Sandoná",
    "Barbacoas", "El Charco", "Cumbal", "Pupiales", "Guachucal", "La Cruz", "Buesaco",
    "Tangua", "Yacuanquer", "Consacá", "Ancuya", "Linares", "El Tambo", "Chachagüí",
    "La Florida", "Nariño", "Ospina", "Imués", "Iles", "Contadero", "Aldana", "Córdoba",
    "Potosí", "Puerres", "Funes", "Ricaurte", "Mallama", "Providencia", "Sapuyes",
    "Guaitarilla", "El Peñol", "Taminango", "San Lorenzo", "Arboleda", "San Pablo", "Belén",
    "Colón", "La Llanada", "Los Andes", "Cumbitara", "El Rosario", "Leiva", "Policarpa",
    "Magüí", "Roberto Payán", "Olaya Herrera", "Mosquera", "La Tola", "Santa Bárbara",
  ],
  "Huila": [
    "Neiva", "Pitalito", "Garzón", "La Plata", "Campoalegre", "Gigante", "Palermo", "Aipe",
    "Rivera", "San Agustín", "Timaná", "Acevedo", "Algeciras", "Isnos", "Tello",
  ],
  "Boyacá": [
    "Tunja", "Duitama", "Sogamoso", "Chiquinquirá", "Paipa", "Puerto Boyacá", "Villa de Leyva",
    "Moniquirá", "Nobsa", "Samacá", "Tibasosa", "Garagoa", "Ramiriquí", "Soatá", "Guateque",
    "Aquitania", "Tibaná", "Ventaquemada", "Combita", "Motavita", "Oicatá", "Sora", "Cucaita",
    "Sotaquirá", "Toca", "Siachoque", "Turmequé", "Nuevo Colón", "Jenesano", "Boyacá",
    "Cerinza", "Belén", "Santa Rosa de Viterbo", "Floresta", "Busbanzá", "Corrales", "Gañeza",
    "Firavitoba", "Iza", "Cuítiva", "Tota", "Monguí", "Mongua", "Sativanorte", "Susacón",
    "Tipacoque", "Covarachía", "Chita", "Jericó", "Socha", "Socotá", "Tasco", "Paz de Río",
    "Betéitiva", "Miraflores", "Chinavita", "Pachavita", "Macanal", "Campohermoso", "Guayatá",
    "Tenza", "La Capilla", "Sutatenza", "Somondoco", "Almeida", "Chivor", "Ciénega", "Viácha",
  ],
  "Meta": [
    "Villavicencio", "Acacías", "Granada", "Puerto López", "San Martín", "Cumaral",
    "Restrepo", "Puerto Gaitán", "Guamal", "Castilla la Nueva", "San Carlos de Guaroa",
    "Fuente de Oro", "El Castillo", "El Dorado", "Cubarral", "Lejanías", "El Calvario",
    "San Juanito", "Barranca de Upía", "Cabuyaro", "San Juan de Arama", "Vistahermosa",
    "Mesetas", "Uribe", "La Macarena", "Puerto Rico", "Puerto Concordia", "Puerto Lleras",
    "Mapiripán", "Cacaimen", "El Rosario",
  ],
  "Cauca": [
    "Popayán", "Santander de Quilichao", "Puerto Tejada", "Patía", "Miranda", "Corinto",
    "Guapi", "Piendamó", "Caloto", "Timbío", "El Tambo", "Silvia", "Bolívar", "Cajibío",
    "Villa Rica", "Padilla", "Buenos Aires", "Suárez", "Morales", "Caldono", "Jambaló",
    "Toribio", "Totoró", "Inzá", "Páez", "Puracé", "Sotará", "La Sierra", "Rosas",
    "La Vega", "Almaguer", "San Sebastián", "Santa Rosa", "Mercaderes", "Balboa", "Argelia",
    "López de Micay", "Timbiquí", "Sucre", "Florencia", "Piamonte",
  ],
  "Tolima": [
    "Ibagué", "Espinal", "Melgar", "Honda", "Líbano", "Chaparral", "Mariquita", "Flandes",
    "Guamo", "Purificación", "Fresno", "Cajamarca", "Ortega", "Lérida", "Venadillo", "Natagaima",
    "Coyaima", "Saldaña", "Rovira", "San Luis", "Valle de San Juan", "El Espinal", "Alvarado",
    "Piedras", "Ambalema", "Armero", "Falan", "Palocabildo", "Casabianca", "Villahermosa",
    "Murillo", "Santa Isabel", "Anzoátegui", "Roncesvalles", "San Antonio", "Planadas",
    "Rioblanco", "Atáco", "Coello", "Flandes", "Suarez", "Prado", "Dolores", "Alpujarra",
    "Cunday", "Villarrica", "Icononzo", "Carmen de Apicalá",
  ],
  "Caldas": [
    "Manizales", "La Dorada", "Chinchiná", "Villamaría", "Riosucio", "Anserma", "Supía",
    "Neira", "Aguadas", "Salamina", "Pácora", "Manzanares", "Pensilvania", "Aranzazu",
  ],
  "Risaralda": [
    "Pereira", "Dosquebradas", "Santa Rosa de Cabal", "La Virginia", "Marsella", "Belén de Umbría",
    "Quinchía", "Apía", "Santuario", "La Celia", "Balboa", "Guática", "Mistrató", "Pueblo Rico",
  ],
  "Quindío": [
    "Armenia", "Calarcá", "La Tebaida", "Montenegro", "Quimbaya", "Circasia", "Filandia",
    "Salento", "Génova", "Pijao", "Córdoba", "Buenavista",
  ],
  "Caquetá": [
    "Florencia", "San Vicente del Caguán", "Puerto Rico", "El Doncello", "La Montañita",
    "El Paujíl", "Cartagena del Chairá", "Belén de los Andaquíes", "Curillo", "Morelia",
  ],
  "Casanare": [
    "Yopal", "Aguazul", "Villanueva", "Tauramena", "Paz de Ariporo", "Monterrey", "Hato Corozal",
    "Maní", "Trinidad", "Nunchía", "Pore", "Orocué",
  ],
  "Chocó": [
    "Quibdó", "Istmina", "Tadó", "Condoto", "Riosucio", "Bahía Solano", "Nuquí", "Acandí",
    "Unguía", "El Carmen de Atrato", "Bojayá", "Certegui", "Novita",
  ],
  "Putumayo": [
    "Mocoa", "Puerto Asís", "Orito", "Valle del Guamuez", "Villagarzón", "Puerto Caicedo",
    "Sibundoy", "San Miguel", "Puerto Guzmán", "Colón", "Santiago",
  ],
  "Arauca": [
    "Arauca", "Saravena", "Tame", "Arauquita", "Fortul", "Puerto Rondón", "Cravo Norte",
  ],
  "Guaviare": ["San José del Guaviare", "El Retorno", "Calamar", "Miraflores"],
  "Vichada": ["Puerto Carreño", "La Primavera", "Santa Rosalía", "Cumaribo"],
  "Amazonas": ["Leticia", "Puerto Nariño"],
  "Guainía": ["Inírida"],
  "Vaupés": ["Mitú", "Carurú", "Taraira"],
  "San Andrés y Providencia": ["San Andrés", "Providencia"],
};

export interface Municipio {
  ciudad: string;
  departamento: string;
}

// Lista plana ordenada de todos los municipios (ciudad + departamento), sin duplicados.
export const MUNICIPIOS: Municipio[] = (() => {
  const vistos = new Set<string>();
  const out: Municipio[] = [];
  for (const [departamento, ciudades] of Object.entries(MUNICIPIOS_POR_DEPARTAMENTO)) {
    for (const ciudad of ciudades) {
      const k = `${ciudad}|${departamento}`.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push({ ciudad, departamento });
    }
  }
  return out.sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es"));
})();

// Normaliza para búsqueda (sin acentos, minúsculas).
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Busca el departamento de una ciudad (match exacto normalizado).
export function departamentoDeCiudad(ciudad: string): string | null {
  const c = norm(ciudad);
  const m = MUNICIPIOS.find((x) => norm(x.ciudad) === c);
  return m ? m.departamento : null;
}

// Filtra municipios por texto (ciudad o departamento).
export function buscarMunicipios(texto: string, limite = 50): Municipio[] {
  const t = norm(texto);
  if (!t) return MUNICIPIOS.slice(0, limite);
  return MUNICIPIOS.filter(
    (m) => norm(m.ciudad).includes(t) || norm(m.departamento).includes(t)
  ).slice(0, limite);
}
