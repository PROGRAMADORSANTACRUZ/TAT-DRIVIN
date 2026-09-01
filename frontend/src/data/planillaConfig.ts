// Datos de auxiliares de ruta y rutas para la Planilla de Despacho.
// Los datos base están aquí; las páginas de configuración pueden sobrescribirlos via localStorage.

export interface Auxiliar {
  id: string;
  nombre: string;
  telefono?: string;
}

export interface Ruta {
  id: string;
  nombre: string;
  recorrido?: string;
  ciudad?: string;
  kls?: number;
  tiempo?: string;
  grupo?: string;
}

// Tipos de despacho disponibles
export const TIPOS_DESPACHO = [
  "Megatienda",
  "Casa",
  "Olímpica",
  "Éxito",
  "TAT Inversiones",
  "TAT Agropecuaria",
  "Inversiones-Distribución",
  "Agropecuaria-Distribución",
];

const LS_AUXILIARES = "sc_auxiliares_v1";
const LS_RUTAS = "sc_rutas_v1";

export const AUXILIARES_BASE: Auxiliar[] = [
  { id: "a1", nombre: "Aux. Alberto Marquez", telefono: "301-2512445" },
  { id: "a2", nombre: "Aux. Brayan Maldonado", telefono: "300-5141691" },
  { id: "a3", nombre: "Aux. De Francisco" },
  { id: "a4", nombre: "Aux. Estiven Hoyos", telefono: "323-2912805" },
  { id: "a5", nombre: "Aux. Jorge Zambrano", telefono: "300-2626244" },
  { id: "a6", nombre: "Aux. Pedro Cantillo" },
  { id: "a7", nombre: "Aux. Samuel Suarez", telefono: "302-3271042" },
  { id: "a8", nombre: "C&D - Alberto Marin" },
  { id: "a9", nombre: "C&D - Alexis Ripoll", telefono: "3042566921" },
  { id: "a10", nombre: "C&D - Brayan Venera" },
  { id: "a11", nombre: "C&D - Britner Sanchez Parra" },
  { id: "a12", nombre: "C&D - Eusebio Carmona", telefono: "317-5933047" },
  { id: "a13", nombre: "C&D - Francisco Cortez" },
  { id: "a14", nombre: "C&D - Francisco Florian" },
  { id: "a15", nombre: "C&D - Franklin Avila" },
  { id: "a16", nombre: "C&D - Heiber Sanchez Parra" },
  { id: "a17", nombre: "C&D - Hugo Rosario", telefono: "324-2371443" },
  { id: "a18", nombre: "C&D - Humberto Moreno" },
  { id: "a19", nombre: "C&D - Ismael Meriño" },
  { id: "a20", nombre: "C&D - Johan Barras" },
  { id: "a21", nombre: "C&D - Jose Altamar", telefono: "304-4250664" },
  { id: "a22", nombre: "C&D - Jose Bolivar", telefono: "300-7531361" },
  { id: "a23", nombre: "C&D - Juan Diego Fuentes" },
  { id: "a24", nombre: "C&D - Juan Jose Hueto" },
  { id: "a25", nombre: "C&D - Luis Escorcia" },
  { id: "a26", nombre: "C&D - Luis Henao", telefono: "301-3279630" },
  { id: "a27", nombre: "C&D - Miguel Angel Robles" },
  { id: "a28", nombre: "C&D - Samuel Galue" },
  { id: "a29", nombre: "C&D - Santiago Blanco", telefono: "301-5434091" },
  { id: "a30", nombre: "C&D - Wilmar Gonzalez" },
  { id: "a31", nombre: "C&D - Wilson Suarez" },
  { id: "a32", nombre: "C&D - Yeiner Beltran" },
  { id: "a33", nombre: "C&D - Yeremi Aragon" },
  { id: "a34", nombre: "C&D - David Alexander Mendoza", telefono: "313-4883247" },
  { id: "a35", nombre: "C&D - Heibert Sanchez" },
  { id: "a36", nombre: "C&D - Waldir Rivera" },
  { id: "a37", nombre: "C&D - Yosman Medina" },
];

/** Lee los auxiliares combinando los base con los personalizados guardados en localStorage */
export function getAuxiliares(): Auxiliar[] {
  if (typeof window === "undefined") return AUXILIARES_BASE;
  try {
    const saved = localStorage.getItem(LS_AUXILIARES);
    return saved ? (JSON.parse(saved) as Auxiliar[]) : AUXILIARES_BASE;
  } catch {
    return AUXILIARES_BASE;
  }
}

export function saveAuxiliares(data: Auxiliar[]): void {
  localStorage.setItem(LS_AUXILIARES, JSON.stringify(data));
}

/** Compatibilidad con el código existente */
export const AUXILIARES: Auxiliar[] = AUXILIARES_BASE;

export const RUTAS: Ruta[] = [
  // PDV CASA
  ...Array.from({ length: 15 }, (_, i) => ({
    nombre: `R${i + 1} - PDV CASA`,
    recorrido: "Malambo-Soledad",
    ciudad: "MALAMBO-SOLEDAD-BARRANQUILLA",
    kls: 40,
    tiempo: "1h 15 min",
    grupo: "PDV CASA",
  })),
  { nombre: "CARTAGENA-PDV", recorrido: "Sabanagrande-Santo Tomas-Palmar de Varela-Sabanalarga-Luruaco-Bayunca", ciudad: "CARTAGENA", kls: 115, tiempo: "2h 15 min", grupo: "Cartagena" },
  { nombre: "CARTAGENA-TAT", recorrido: "Sabanagrande-Santo Tomas-Palmar de Varela-Sabanalarga-Luruaco-Bayunca", ciudad: "CARTAGENA", kls: 115, tiempo: "2h 15 min", grupo: "Cartagena" },
  { nombre: "SANTA MARTA", recorrido: "Palermo-Pueblo Viejo-Cienaga", ciudad: "SANTA MARTA", kls: 106, tiempo: "2h 20 min", grupo: "Santa Marta" },
  { nombre: "PIVIJAY", recorrido: "Sabanagrande-Santo Tomas-Palmar de Varela-Ponedera-La Retirada", ciudad: "PIVIJAY", kls: 89, tiempo: "2h 37 min", grupo: "Poblaciones" },
  { nombre: "PLATO", recorrido: "Sabanagrande-Santo Tomas-Palmar de Varela-Calamar-San Jacinto-El Carmen", ciudad: "PLATO", kls: 192, tiempo: "3h 30 min", grupo: "Poblaciones" },
  ...Array.from({ length: 5 }, (_, i) => ({
    nombre: `R${i + 1} - MEGA CARTAGENA`,
    recorrido: "Sabanagrande-Santo Tomas-Palmar de Varela-Sabanalarga-Luruaco",
    ciudad: "CARTAGENA",
    kls: 115,
    tiempo: "2h 15 min",
    grupo: "Cartagena",
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    nombre: `R${i + 1} - MEGA LOCAL`,
    recorrido: "Malambo-Barranquilla",
    ciudad: "MALAMBO-SOLEDAD-BARRANQUILLA",
    kls: 40,
    tiempo: "1h 15 min",
    grupo: "Local",
  })),
  { nombre: "R1 - MEGA SANTO TOMAS", recorrido: "Malambo-Soledad-Barranquilla", ciudad: "SANTO TOMAS-BARRANQUILLA", kls: 45, tiempo: "1h 30 min", grupo: "Local" },
  { nombre: "R1 - MEGA SANTA MARTA", recorrido: "Palermo-Pueblo Viejo-Cienaga", ciudad: "SANTA MARTA", kls: 106, tiempo: "2h 20 min", grupo: "Santa Marta" },
  { nombre: "R2 - MEGA SANTA MARTA", recorrido: "Palermo-Pueblo Viejo-Cienaga", ciudad: "SANTA MARTA", kls: 106, tiempo: "2h 20 min", grupo: "Santa Marta" },
  { nombre: "PDV BUCARAMANGA", recorrido: "Palermo-Cienaga-Fundacion-Bosconia-Pailitas-Aguachica-San Alberto-Rio Negro", ciudad: "BUCARAMANGA", kls: 586, tiempo: "10h 40 min", grupo: "Clientes Varios" },
  { nombre: "R1-INVERSIONES", grupo: "Inversiones" },
  { nombre: "R2-INVERSIONES", grupo: "Inversiones" },
  { nombre: "R3-INVERSIONES", grupo: "Inversiones" },
  { nombre: "R4-INVERSIONES", grupo: "Inversiones" },
  { nombre: "R5-MONTERIA", recorrido: "Sabanagrande-Santo Tomas-Campo de la Cruz-Carreto-San Onofre-Tolu-Coveñas-Cerete", ciudad: "MONTERIA", kls: 336, tiempo: "5h 30 min", grupo: "Poblaciones" },
  { nombre: "R6- MONTERIA -SINCELEJO", recorrido: "Sabanagrande-Santo Tomas-Campo de la Cruz-Carreto-San Onofre-Tolu-Coveñas-Cerete-Monteria", ciudad: "MONTERIA-SINCELEJO", kls: 457, tiempo: "7h 45 min", grupo: "Poblaciones" },
  { nombre: "SANTA MARTA - TAT", recorrido: "Malambo-Cienaga-Santa Marta", ciudad: "SANTA MARTA", grupo: "Santa Marta" },
  { nombre: "VALLEDUPAR - TAT", recorrido: "Malambo-Soledad-Barranquilla-Cienaga-Santa Marta-Bosconia-Guatapuri-Rio Seco-Valledupar", ciudad: "VALLEDUPAR", kls: 369, tiempo: "6h 42 min", grupo: "Poblaciones" },
  { nombre: "MEGATIENDA VILLA CAMPESTRE", grupo: "Local" },
].map((r, i) => ({ id: `r${i + 1}`, ...r })) as Ruta[];

export const RUTAS_BASE: Ruta[] = RUTAS;

export function getRutas(): Ruta[] {
  if (typeof window === "undefined") return RUTAS_BASE;
  try {
    const saved = localStorage.getItem(LS_RUTAS);
    return saved ? (JSON.parse(saved) as Ruta[]) : RUTAS_BASE;
  } catch {
    return RUTAS_BASE;
  }
}

export function saveRutas(data: Ruta[]): void {
  localStorage.setItem(LS_RUTAS, JSON.stringify(data));
}
