# Security — SAMP

## Auth model

- Passwords: **Argon2id** (`argon2-cffi`)
- Sessions: HttpOnly cookies + CSRF double-submit (header `X-CSRF-Token` must match cookie)
- First admin: `python -m app.cli create-admin` (no default credentials)
- Login rate limiting; account disable; password policy enforced server-side
- Optional TOTP 2FA when enabled in settings

## Permission matrix (default roles)

| Permission | Admin | Manager | Analyst | Viewer |
|------------|:-----:|:-------:|:-------:|:------:|
| `user.manage` | ✓ | | | |
| `role.manage` | ✓ | | | |
| `workflow.manage` | ✓ | ✓ | | |
| `project.create` | ✓ | ✓ | | |
| `project.update` | ✓ | ✓ | assigned fields | |
| `project.read` | ✓ | ✓ | assigned | permitted |
| `task.update` | ✓ | ✓ | assigned | |
| `finding.create` | ✓ | ✓ | assigned project | |
| `finding.update` | ✓ | ✓ | own / assigned | |
| `evidence.upload` | ✓ | ✓ | assigned | |
| `evidence.download` | ✓ | ✓ | assigned | permitted |
| `report.generate` | ✓ | ✓ | | |
| `report.read` | ✓ | ✓ | assigned | permitted |
| `audit.read` | ✓ | ✓* | | |
| `settings.manage` | ✓ | | | |

\* Manager audit scoped to owned projects when enforced.

**Object-level checks:** every resource endpoint verifies membership/assignment (IDOR prevention). Frontend hiding is UX only.

## Headers

CSP (tuned for SPA), HSTS (production HTTPS), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, frame denial.

## Uploads / evidence

- Allowlist MIME + extension; magic-byte checks where practical
- Random `storage_key`; SHA-256; size cap; path traversal blocked
- Never public URLs; stream via authenticated download
- Optional ClamAV hook documented in deployment guides

## Audit

Append-only application guard. Never log passwords, tokens, cookies, keys, or evidence bytes.

## Production checklist

- [ ] HTTPS
- [ ] Strong `SECRET_KEY`
- [ ] Migrations applied
- [ ] No default credentials
- [ ] RBAC enforced
- [ ] Rate limiting
- [ ] CSRF + secure cookies
- [ ] Security headers
- [ ] Private evidence storage
- [ ] Upload restrictions
- [ ] Audit logging
- [ ] Backups + tested restore
- [ ] Firewall (22/80/443)
- [ ] PostgreSQL not public
- [ ] Sanitized errors
- [ ] No secrets in Git
- [ ] Correct CORS
- [ ] Health check verified
