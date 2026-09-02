// Deduplica la tabla ClienteTat actual por clave natural NIT-sucursal.
// Conserva la primera fila (prioriza las editadas manualmente) y elimina el
// resto de duplicados. No toca las eliminadas (borrado lógico).
import { prisma } from "../src/lib/prisma";

function claveNitSuc(nit: string | null, sucursal: string | null): string | null {
  if (!nit) return null;
  const suc = parseInt(String(sucursal ?? "").trim(), 10);
  return Number.isFinite(suc) ? `${nit}-${suc}` : `${nit}`;
}

async function main() {
  const filas = await prisma.clienteTat.findMany({
    where: { eliminado: false },
    select: { id: true, nit: true, sucursal: true, editado: true, direccion1: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const grupos = new Map<string, typeof filas>();
  for (const f of filas) {
    const k = claveNitSuc(f.nit, f.sucursal);
    if (!k) continue; // sin NIT: no se puede deduplicar, se deja
    const arr = grupos.get(k) ?? [];
    arr.push(f);
    grupos.set(k, arr);
  }

  const aEliminar: string[] = [];
  for (const arr of grupos.values()) {
    if (arr.length <= 1) continue;
    // Keeper: primera editada; si no hay, primera con dirección; si no, la primera.
    const editada = arr.find((x) => x.editado);
    const conDir = arr.find((x) => x.direccion1);
    const keeper = editada ?? conDir ?? arr[0];
    for (const x of arr) {
      if (x.id === keeper.id) continue;
      if (x.editado) continue; // nunca borrar filas editadas manualmente
      aEliminar.push(x.id);
    }
  }

  console.log("Filas vivas:", filas.length);
  console.log("Claves NIT-sucursal únicas:", grupos.size);
  console.log("Duplicados a eliminar:", aEliminar.length);

  if (aEliminar.length > 0) {
    // Elimina en lotes para no exceder límites de parámetros.
    let borrados = 0;
    for (let i = 0; i < aEliminar.length; i += 500) {
      const lote = aEliminar.slice(i, i + 500);
      const { count } = await prisma.clienteTat.deleteMany({ where: { id: { in: lote } } });
      borrados += count;
    }
    console.log("Eliminados:", borrados);
  }

  const total = await prisma.clienteTat.count({ where: { eliminado: false } });
  console.log("Total ClienteTat vivos ahora:", total);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
