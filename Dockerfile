# ============================================================
# DRIVIN-TAT - Dockerfile de producción para Dokploy
# Monorepo: frontend (Next.js) + backend (Express/Prisma).
# Un solo contenedor: Nginx en :80 hace proxy de
#   /api  → backend Node (:4000)
#   /     → Next.js server (:3000)
# La base de datos es externa (se pasa por DATABASE_URL).
# ============================================================

# ---- Etapa 1: Build (frontend + backend) ----
FROM node:20-alpine AS builder
WORKDIR /app

# Instala dependencias del monorepo (root + workspaces)
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm install

# Copia el código (el .dockerignore excluye node_modules, .next, .env)
COPY . .

# Genera el cliente de Prisma
RUN npm run db:generate -w backend

# URL del API para el frontend (vacío = mismo origen /api vía Nginx)
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Compila backend (tsc) y frontend (next build)
RUN npm run build -w backend && npm run build -w frontend

# ---- Etapa 2: Imagen de producción ----
FROM node:20-alpine
RUN apk add --no-cache nginx dumb-init
WORKDIR /app

# Copia el monorepo ya construido (incluye node_modules, .next y dist)
COPY --from=builder /app ./

# Nginx + script de arranque
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-start.sh /docker-start.sh
RUN chmod +x /docker-start.sh

ENV NODE_ENV=production

EXPOSE 80

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/docker-start.sh"]
