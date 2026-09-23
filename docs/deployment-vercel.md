# Deploy on Vercel (Frontend) + cloud API

SAMP is a **SPA + FastAPI** app. Vercel hosts the **frontend** well.
The **API** needs a container/VM (Render, Railway, Fly.io, or a VPS) plus managed Postgres.
Do **not** run FastAPI as Vercel Serverless for this project (uploads, sessions, long work).

## Architecture

| Piece | Where |
|-------|--------|
| React frontend | **Vercel** |
| FastAPI backend | Render / Railway / VPS |
| PostgreSQL | Neon, Supabase, Render Postgres, … |
| Evidence files | **Vercel Blob** or S3 |

```text
Browser  →  https://your-app.vercel.app
              ├─ /*          static SPA
              └─ /api/*  ──rewrite──►  https://your-api.onrender.com/api/*
```

Same-origin rewrites keep cookies as first-party (`SameSite=Lax`).

---

## Arabic — خطوات النشر

### أ) قاعدة البيانات (Neon مجاني مثلاً)

1. أنشئ مشروعاً على [neon.tech](https://neon.tech) وانسخ `DATABASE_URL` (صيغة `postgresql://...`).
2. حوّلها لـ SQLAlchemy إن لزم:  
   `postgresql+psycopg://USER:PASS@HOST/DB?sslmode=require`

### ب) الـ Backend (Render مثال)

1. ارفع المستودع إلى GitHub.
2. على [render.com](https://render.com): **New → Blueprint** واستخدم `render.yaml` من جذر المشروع،  
   أو Web Service يدوياً:
   - Root directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Environment (انظر أيضاً `backend/.env.production.example`):

```env
ENVIRONMENT=production
SECRET_KEY=<عشوائي 32+ حرف>
DATABASE_URL=postgresql+psycopg://...
CORS_ORIGINS=https://YOUR_APP.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
STORAGE_BACKEND=vercel_blob
VERCEL_BLOB_TOKEN=<أو BLOB_READ_WRITE_TOKEN من Vercel Blob>
```

4. بعد أول نشر، من Shell على Render:

```bash
python -m app.cli seed
# أو: alembic upgrade head && python -m app.cli ensure-admin
```

دخول افتراضي بعد seed: `admin` / `1234` — غيّر كلمة المرور فوراً.

5. انسخ رابط الـ API، مثال: `https://samp-api.onrender.com`

### ج) Vercel Blob (للأدلة)

1. من مشروع Vercel: Storage → Blob → Create.
2. انسخ `BLOB_READ_WRITE_TOKEN` وضعه في متغيرات الـ Backend.

### د) الواجهة على Vercel

1. [vercel.com/new](https://vercel.com/new) → استورد المستودع.
2. **Root Directory:** `frontend`
3. Framework: Vite (يُكتشف تلقائياً عبر `vercel.json`)
4. Environment Variables:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `/api/v1` |

5. فعّل بروكسي الـ API (نفس المصدر):
   - انسخ `frontend/vercel.rewrites.example.json` → استبدل محتوى `frontend/vercel.json`
   - غيّر `YOUR_API_HOST` إلى مضيف الـ API فقط، مثال: `samp-api.onrender.com`  
     (بدون `https://` في المثال؟ لا — في الملف استخدم `https://samp-api.onrender.com`)

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://samp-api.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

6. Deploy. بعد الظهور، حدّث `CORS_ORIGINS` في الـ Backend إلى `https://your-app.vercel.app` وأعد تشغيل الـ API.

### هـ) تحقق سريع

- افتح الموقع → تسجيل الدخول يعمل والكوكيز على نفس النطاق.
- `/health` عبر `https://your-app.vercel.app/api/...` يعتمد على أن الـ rewrite يمرّر المسارات تحت `/api`.
- الـ API مباشرة: `https://your-api.../health`

---

## Alternative: cross-origin (no rewrite)

Set on Vercel build:

```env
VITE_API_URL=https://your-api.onrender.com/api/v1
```

Backend:

```env
COOKIE_SAMESITE=none
COOKIE_SECURE=true
CORS_ORIGINS=https://your-app.vercel.app
```

Prefer the rewrite approach above.

---

## CLI deploy (optional)

```bash
cd frontend
npm i -g vercel
cp .env.production.example .env.production
# edit vercel.json rewrites with your API host
vercel --prod
```

---

## Checklist

- [ ] Postgres (not SQLite) in production  
- [ ] Strong `SECRET_KEY`  
- [ ] `COOKIE_SECURE=true`  
- [ ] `CORS_ORIGINS` includes the Vercel URL  
- [ ] `STORAGE_BACKEND=vercel_blob` or `s3` (never `local`)  
- [ ] Seed / migrate after first API deploy  
- [ ] Change default admin password  
