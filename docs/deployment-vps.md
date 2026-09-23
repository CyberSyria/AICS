# Deploy on VPS (Ubuntu LTS)

Recommended path: Docker Compose on the VPS, Nginx TLS termination, PostgreSQL only on the Docker network.

## 1. Server prep

```bash
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
# Install Docker Engine + Compose plugin (official Docker docs)
```

Create deploy user and directory:

```bash
sudo mkdir -p /opt/security-platform
sudo chown $USER:$USER /opt/security-platform
cd /opt/security-platform
# clone or copy release here
cp .env.example .env
# edit SECRET_KEY, COOKIE_SECURE=true, CORS_ORIGINS=https://your.domain
```

## 2. TLS with Nginx (host) → Docker frontend

Option A — use the compose `frontend` nginx on port 80 and put Certbot/Nginx on the host proxying to `127.0.0.1:80`.

Option B — publish backend only internally; host Nginx serves static `frontend/dist` and proxies `/api` to `127.0.0.1:8000`.

Example host proxy snippet:

```nginx
server {
  listen 443 ssl http2;
  server_name samp.example.com;
  # ssl_certificate ...;
  # ssl_certificate_key ...;

  location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 30m;
  }
  location / {
    root /opt/security-platform/frontend/dist;
    try_files $uri /index.html;
  }
}
```

## 3. First boot

```bash
cd /opt/security-platform
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.cli create-admin --email admin@example.com --password 'StrongPass!'
docker compose exec backend python -m app.cli seed
curl -fsS https://samp.example.com/health
```

## 4. Backups

```bash
# /etc/cron.d/samp-backup example
0 2 * * * root docker compose -f /opt/security-platform/docker-compose.yml exec -T db pg_dump -U samp samp | gzip > /var/backups/samp/db-$(date +\%F).sql.gz
```

Also rsync `/data/storage` (evidence volume) off-site. Test restore quarterly:

```bash
gunzip -c db-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U samp samp
```

## 5. Overdue / scheduled jobs

On VPS, run a systemd timer or cron hitting an internal endpoint or CLI:

```bash
docker compose exec backend python -m app.cli notify-overdue
```

## 6. Hardening reminders

- Do not publish Postgres ports to the internet
- `COOKIE_SECURE=true`, strong `SECRET_KEY`
- Firewall 22/80/443 only
- Log rotation via Docker/journald
- Keep images updated
