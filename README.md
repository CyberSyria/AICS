# Security Assessment Management Platform (SAMP)

منصة داخلية لقيادة فريق الأمن: تقييمات مرنة، إسناد مهام، ثغرات وأدلة، وتقارير EN/AR.

**الخط:** عائلة **Qomra** من مجلد `komra_font/` (Light / Regular / Medium / Bold / Black).

## التشغيل السريع (محلي — Windows)

### 1) Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# أول مرة فقط:
python -m app.cli seed
# ينشئ الأدمن الافتراضي: admin / 1234

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2) Frontend (طرفية ثانية)

```powershell
cd frontend
npm install
copy .env.example .env
# تأكد أن الملف يحتوي:
# VITE_API_URL=/api/v1
# VITE_API_PROXY=http://127.0.0.1:8000

npm run dev
```

افتح: http://127.0.0.1:5173

**تسجيل الدخول:** اسم المستخدم `admin` · كلمة المرور `1234`  
غيّر كلمة المرور من **الإعدادات → الأمان**.  
لوحة إدارة المستخدمين: `/admin`

> مهم: استخدم نفس العنوان للمتصفح والـ API عبر بروكسي Vite (`VITE_API_URL=/api/v1`) حتى تعمل الكوكيز.

### إعادة ضبط الأدمن

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.cli ensure-admin
```

### إعادة ضبط صلاحيات الأدوار (مشاهد لا ينشئ مشاريع)

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.cli reset-roles
```

ثم اطلب من المستخدم المشاهد **تسجيل الخروج والدخول** ليُحدَّث قائمة صلاحياته.

### ngrok (عرض محلي عبر الإنترنت)

1. شغّل الـ backend على المنفذ `8000` والـ frontend على `5173` كما فوق.
2. وجّه النفق إلى **Vite** وليس إلى الـ API مباشرة:

```powershell
ngrok http 5173
```

3. افتح رابط ngrok، ثم **حدّث بقوة** (Ctrl+Shift+R) بعد أي تعديل في الكود.
4. إن لم تظهر التعديلات: أوقف Vite وأعد `npm run dev`، وتأكد أن النفق يشير لنفس المنفذ `5173`.

> لا تفتح ngrok على `8000` فقط — الواجهة لن تُحدَّث ولن يعمل بروكسي `/api`.

---

## Docker (3 أوامر)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.cli seed
```

ثم افتح http://localhost — دخول: `admin` / `1234`

---

## الرفع على VPS أو Vercel

| الهدف | الدليل |
|--------|--------|
| VPS (Ubuntu + Nginx + Docker) | [docs/deployment-vps.md](docs/deployment-vps.md) |
| **Vercel (واجهة) + API سحابي** | [docs/deployment-vercel.md](docs/deployment-vercel.md) |

### Vercel — ملخص سريع

1. **Postgres:** Neon (أو أي Postgres مُدار).
2. **API:** Render/Railway من مجلد `backend/` (يوجد `render.yaml` جاهز) مع  
   `ENVIRONMENT=production` و`COOKIE_SECURE=true` و`STORAGE_BACKEND=vercel_blob`.
3. **Vercel:** مشروع جديد، Root Directory = `frontend`،  
   `VITE_API_URL=/api/v1`، وانسخ إعدادات البروكسي من  
   `frontend/vercel.rewrites.example.json` بعد استبدال عنوان الـ API.
4. نفّذ على الـ API: `python -m app.cli seed` ثم غيّر كلمة مرور `admin`.

التفاصيل الكاملة: [docs/deployment-vercel.md](docs/deployment-vercel.md).

---

## البنية

```text
frontend/     React + Vite + Tailwind + i18n (EN|AR + RTL)
backend/      FastAPI + SQLAlchemy + Alembic + Argon2id
komra_font/   خطوط Qomra الأصلية (مصدر النسخ إلى frontend)
docs/         معمارية، أمن، نشر
```

تفاصيل التصميم وRBAC: [docs/architecture.md](docs/architecture.md)

## تعديلات مهمة في المصادقة

- الدخول بـ **اسم المستخدم + كلمة المرور** (بدون بريد في شاشة الدخول)
- أدمن افتراضي عبر `seed`: `admin` / `1234`
- تغيير كلمة المرور من الإعدادات
- لوحة `/admin` لإدارة المستخدمين والأدوار والصلاحيات وإسناد المهام

## قائمة تحقق الإنتاج

HTTPS · `SECRET_KEY` قوي · migrations · لا تعتمد على كلمة المرور الافتراضية في الإنتاج · RBAC · rate limiting · CSRF · cookies آمنة · تخزين أدلة خاص · audit · backups · PostgreSQL غير عام · لا أسرار في Git · health check

## License

MIT — [LICENSE](LICENSE)
