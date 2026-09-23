# Troubleshooting

| Symptom | Check |
|---------|--------|
| Login 401 / CSRF error | Send cookies (`credentials: 'include'`), include `X-CSRF-Token`, CORS origins match, `COOKIE_SAMESITE` |
| CORS blocked | `CORS_ORIGINS` must list exact frontend origin |
| DB connection failed | `DATABASE_URL`, Postgres running, migrations applied |
| Empty lookups / no workflows | Run `python -m app.cli seed` |
| Cannot create admin | If admin exists, setup is locked — use existing admin |
| Evidence upload 413 | Raise Nginx/`client_max_body_size` and `MAX_UPLOAD_BYTES` |
| PDF Arabic broken | Install WeasyPrint system libs (see Dockerfile.backend); fonts-noto |
| Vercel cookies missing | Use rewrites for `/api` same-origin, or `SameSite=None; Secure` |
| Permission denied on API | Role permissions + object membership (IDOR) |
| Port in use | Change Vite 5173 / Uvicorn 8000 |

Health probes:

```bash
curl -fsS http://localhost:8000/health
```
