import httpx

base = "http://127.0.0.1:8000"
c = httpx.Client(base_url=base, timeout=30.0)

r = c.get("/health")
print("health", r.status_code, r.json())

r = c.post(
    "/api/v1/auth/login",
    json={"email": "admin@example.com", "password": "ChangeMe!12345"},
)
print("login", r.status_code)
csrf = r.cookies.get("samp_csrf")
if r.is_success:
    data = r.json()
    csrf = data.get("csrf_token") or csrf
    print("email", data.get("email"), "perm_count", len(data.get("permissions") or []))

headers = {"X-CSRF-Token": csrf or ""}
for path in ("/api/v1/auth/me", "/api/v1/dashboard", "/api/v1/workflows", "/api/v1/lookups/severities", "/api/v1/projects"):
    r = c.get(path, headers=headers)
    print(path, r.status_code, "ok" if r.is_success else r.text[:120])
