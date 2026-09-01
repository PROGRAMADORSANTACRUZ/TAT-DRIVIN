import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const users = [
    { cedula: "1234567890", password: "admin1234", name: "Administrador", role: "ADMIN" as const },
    { cedula: "1044616409", password: "6409", name: "Desarrollador", role: "DEVELOPER" as const },
  ];

  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { cedula: u.cedula },
      update: { password: hashed, name: u.name, role: u.role },
      create: { cedula: u.cedula, password: hashed, name: u.name, role: u.role },
    });
    console.log(`✅ Usuario listo -> cédula: ${u.cedula}  contraseña: ${u.password}  rol: ${u.role}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
