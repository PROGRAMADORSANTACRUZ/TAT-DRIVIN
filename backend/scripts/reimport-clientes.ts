// Reemplaza por completo el maestro de clientes (tabla Cliente) con el contenido
// del Excel de Direcciones (grandes superficies / distribución). No toca ClienteTat.
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const XLSX_PATH = process.argv[2];

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Campo del modelo -> encabezado del Excel.
const CAMPOS: { key: string; header: string }[] = [
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

function parse(buffer: Buffer): Record<string, string | null | boolean>[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length < 2) return [];

  const header = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const { key, header: label } of CAMPOS) {
    idx[key] = header.findIndex((h) => h === norm(label));
  }

  const pick = (r: unknown[], i: number) =>
    i >= 0 ? String(r[i] ?? "").trim() : "";

  const out: Record<string, string | null | boolean>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row: Record<string, string | null | boolean> = {};
    for (const { key } of CAMPOS) {
      const v = pick(r, idx[key]);
      row[key] = v === "" ? null : v;
    }
    if (!row.codigoDireccion && !row.nombreDireccion && !row.cliente) continue;
    // Todos son grandes superficies (distribución).
    row.tipo = "Distribución";
    row.activo = true;
    out.push(row);
  }
  return out;
}

async function main() {
  const buf = readFileSync(XLSX_PATH);
  const clientes = parse(buf);
  if (clientes.length === 0) {
    throw new Error("El archivo no contiene clientes válidos");
  }
  console.log(`Clientes parseados desde el Excel: ${clientes.length}`);

  const [{ count: eliminados }, creados] = await prisma.$transaction([
    prisma.cliente.deleteMany(),
    prisma.cliente.createMany({ data: clientes as never }),
  ]);

  const totalTat = await prisma.clienteTat.count();
  console.log(`Clientes eliminados (tabla Cliente): ${eliminados}`);
  console.log(`Clientes creados desde el Excel: ${creados.count}`);
  console.log(`ClienteTat (intacta): ${totalTat}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
