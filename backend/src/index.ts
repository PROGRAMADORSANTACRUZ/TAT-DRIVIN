import { createApp } from "./app";
import { env } from "./config/env";
import { iniciarLimpiezaDiaria } from "./jobs/limpiezaDiaria";

const app = createApp();

// El job de limpieza corre en TODOS los entornos (misma BD compartida siempre).
iniciarLimpiezaDiaria();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${env.PORT}`);
  console.log(`   Entorno: ${env.NODE_ENV}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} recibido. Cerrando servidor…`);
  server.close(() => {
    console.log("Servidor cerrado.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
