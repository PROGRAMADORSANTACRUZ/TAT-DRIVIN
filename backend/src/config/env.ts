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
  TAT_INVOICES_URL: z
    .string()
    .default(
      "https://sigcom.grupo-santacruz.com/api/public/dispatch/tat-invoices?cia={cia}"
    ),
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
