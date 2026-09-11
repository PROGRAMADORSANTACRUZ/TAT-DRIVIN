#!/bin/sh
# Arranca backend (Express :4000) + frontend (Next.js :3000) y Nginx (:80) en primer plano.
set -e

# Sincroniza el esquema de Prisma con la BD (agrega columnas nuevas nullable).
# No es fatal: si falla, el backend arranca igual con el esquema existente.
( cd /app/backend && npx prisma db push --skip-generate ) || echo "prisma db push omitido (continuando)"

# Backend Express
node /app/backend/dist/index.js &

# Frontend Next.js (necesita cwd = frontend)
cd /app/frontend
/app/node_modules/.bin/next start -p 3000 &

# Nginx en primer plano (mantiene vivo el contenedor)
cd /app
nginx -g "daemon off;"
