import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET debe tener al menos 16 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  DRIVIN_API_URL: z
    .string()
    .default("https://external.driv.in/api/external"),
  DRIVIN_API_KEY: z.string().optional(),
  CLIENTES_TAT_URL: z
    .string()
    // Tokens en .env, nunca en código fuente
    .default("https://apiconsulta.grupo-santacruz.com/clientes-tat"),
  // Token de apiconsulta (mismo que PRICE_LISTS_TOKEN de SIGCOM). Se envía como ?token=
  CLIENTES_TAT_TOKEN: z.string().optional(),
  TAT_INVOICES_URL: z
    .string()
    .default(
      "https://sigcom.grupo-santacruz.com/api/public/dispatch/tat-invoices?cia={cia}"
    ),
  // Token de la API pública de despacho de SIGCOM (DISPATCH_API_TOKEN). Se envía
  // en el header x-api-key; sin él la API responde 401.
  TAT_INVOICES_TOKEN: z.string().optional(),
  // Consulta directa a apiconsulta (Siesa) por factura: reemplaza el intermediario
  // SIGCOM. Se consulta con ?cia=&fecha_inicio=&fecha_fin=&documento=&token=
  // (el token es el mismo CLIENTES_TAT_TOKEN de apiconsulta).
  FACTURAS_AGRO_URL: z
    .string()
    .default("https://apiconsulta.grupo-santacruz.com/ventas/facturas-agropecuaria-tat"),
  FACTURAS_INV_URL: z
    .string()
    .default("https://apiconsulta.grupo-santacruz.com/ventas/facturas-tat-inversiones"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Variables de entorno inválidas:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsed.data;
