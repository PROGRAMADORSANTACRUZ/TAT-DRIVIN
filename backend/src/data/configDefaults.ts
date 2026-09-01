// Valores por defecto de configuración operativa (antes en localStorage del frontend).
// Se usan para sembrar las tablas la primera vez que se consultan si están vacías.

export interface AuxiliarSeed { nombre: string; telefono?: string }
export interface RutaSeed {
  nombre: string;
  recorrido?: string;
  ciudad?: string;
  kls?: number;
  tiempo?: string;
  grupo?: string;
}
export interface PlanNombreSeed { nombre: string; tipo?: string }

export const AUXILIARES_DEFAULT: AuxiliarSeed[] = [
  { nombre: "Aux. Alberto Marquez", telefono: "301-2512445" },
  { nombre: "Aux. Brayan Maldonado", telefono: "300-5141691" },
  { nombre: "Aux. De Francisco" },
  { nombre: "Aux. Estiven Hoyos", telefono: "323-2912805" },
  { nombre: "Aux. Jorge Zambrano", telefono: "300-2626244" },
  { nombre: "Aux. Pedro Cantillo" },
  { nombre: "Aux. Samuel Suarez", telefono: "302-3271042" },
  { nombre: "C&D - Alberto Marin" },
  { nombre: "C&D - Alexis Ripoll", telefono: "3042566921" },
  { nombre: "C&D - Brayan Venera" },
  { nombre: "C&D - Britner Sanchez Parra" },
  { nombre: "C&D - Eusebio Carmona", telefono: "317-5933047" },
  { nombre: "C&D - Francisco Cortez" },
  { nombre: "C&D - Francisco Florian" },
  { nombre: "C&D - Franklin Avila" },
  { nombre: "C&D - Heiber Sanchez Parra" },
  { nombre: "C&D - Hugo Rosario", telefono: "324-2371443" },
  { nombre: "C&D - Humberto Moreno" },
  { nombre: "C&D - Ismael Meriño" },
  { nombre: "C&D - Johan Barras" },
  { nombre: "C&D - Jose Altamar", telefono: "304-4250664" },
  { nombre: "C&D - Jose Bolivar", telefono: "300-7531361" },
  { nombre: "C&D - Juan Diego Fuentes" },
  { nombre: "C&D - Juan Jose Hueto" },
  { nombre: "C&D - Luis Escorcia" },
  { nombre: "C&D - Luis Henao", telefono: "301-3279630" },
  { nombre: "C&D - Miguel Angel Robles" },
  { nombre: "C&D - Samuel Galue" },
  { nombre: "C&D - Santiago Blanco", telefono: "301-5434091" },
  { nombre: "C&D - Wilmar Gonzalez" },
  { nombre: "C&D - Wilson Suarez" },
  { nombre: "C&D - Yeiner Beltran" },
  { nombre: "C&D - Yeremi Aragon" },
  { nombre: "C&D - David Alexander Mendoza", telefono: "313-4883247" },
  { nombre: "C&D - Heibert Sanchez" },
  { nombre: "C&D - Waldir Rivera" },
  { nombre: "C&D - Yosman Medina" },
];

export const RUTAS_DEFAULT: RutaSeed[] = [
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
];

export const PLAN_NOMBRES_DEFAULT: PlanNombreSeed[] = [
  { nombre: "Distribución Megatiendas", tipo: "Megatienda" },
  { nombre: "Distribución Casa", tipo: "Casa" },
  { nombre: "Distribución Éxito", tipo: "Éxito" },
  { nombre: "Distribución TAT", tipo: "TAT" },
  { nombre: "Distribución Olímpica", tipo: "Olímpica" },
  { nombre: "Distribución Isimo", tipo: "Isimo" },
];
