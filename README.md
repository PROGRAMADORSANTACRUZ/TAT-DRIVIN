# DRIVIN-TAT

Monorepo con **Next.js** (frontend) y **Node.js + Express** (backend), escrito en **TypeScript**, con **Tailwind CSS** en el frontend y **Prisma + PostgreSQL** (en la nube) en el backend.

## Estructura

```
DRIVIN-TAT/
├── frontend/        # Next.js (App Router) + Tailwind CSS
├── backend/         # Express + Prisma (PostgreSQL)
├── package.json     # npm workspaces + scripts globales
└── README.md
```

## Requisitos

- Node.js >= 18.18
- npm >= 9
- Una base de datos PostgreSQL en la nube (Neon, Supabase, Railway, etc.)

## Puesta en marcha

1. Instala las dependencias desde la raíz:

   ```bash
   npm install
   ```

2. Configura las variables de entorno:

   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Frontend
   cp frontend/.env.local.example frontend/.env.local
   ```

   Edita `backend/.env` y coloca tu cadena de conexión de PostgreSQL en la nube en `DATABASE_URL`.

3. Genera el cliente de Prisma y aplica el esquema:

   ```bash
   npm run db:generate -w backend
   npm run db:push -w backend
   ```

4. Arranca frontend y backend a la vez:

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:3000
   - Backend:  http://localhost:4000

## Scripts útiles (desde la raíz)

| Comando                     | Descripción                                  |
| --------------------------- | -------------------------------------------- |
| `npm run dev`               | Levanta frontend y backend en paralelo       |
| `npm run dev:frontend`      | Solo frontend                                |
| `npm run dev:backend`       | Solo backend                                 |
| `npm run build`             | Compila backend y frontend                   |
| `npm run start`             | Ejecuta ambos en modo producción             |
