# Frontend — Security Assessment Management Platform (SAMP)

## Stack

React 18 · TypeScript · Vite · React Router · Tailwind CSS 3 · TanStack Query · React Hook Form · Zod · i18next · Lucide · Recharts · @dnd-kit

Primary UI font: **Qamra** (`src/assets/fonts/Qamra.ttf`) for Latin and Arabic.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # if needed
npm run dev
```

Open http://localhost:5173

API base URL: `VITE_API_URL` (default `http://localhost:8000/api/v1`). Dev server proxies `/api` to `VITE_API_PROXY`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

## Vercel

`vercel.json` rewrites non-API routes to `index.html` for SPA routing. Set `VITE_API_URL` at build time, or proxy `/api/*` to the backend for same-origin cookies.
