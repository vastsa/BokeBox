---
description: Deploy BokeBox locally or with Docker.
---

# Deployment

Aimed at **single-user private deploy**. Data lives under local `storage/`.

## Options

| Mode | When | Command |
| --- | --- | --- |
| Local dev | Coding | `./start.sh` or `pnpm dev` |
| Prod single port | Small VPS / bare Node | `./start.sh prod` |
| Docker prebuilt | Recommended prod | `./start.sh docker` |
| Docker local build | Custom Dockerfile | `./start.sh docker.local` |
| Docker CN build | Slow base pulls in CN | `./start.sh docker.cn` |

## Dev mode

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env
./start.sh
```

- Web: usually `http://localhost:5173`
- API: `http://localhost:8787`

## Prod single port

```bash
cp .env.example .env
./start.sh prod
```

Builds the web app; server serves static + API (`PORT`).

## Docker prebuilt (recommended)

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
```

Or `docker compose up -d`. `./storage` is mounted for persistence.

Tags: `latest`, `sha-<short>` — see [CI/CD](../ops/ci-cd.md).

## Docker local / CN

```bash
./start.sh docker.local
./start.sh docker.cn
```

## Reverse proxy (Nginx sketch)

```nginx
server {
  listen 443 ssl http2;
  server_name podcast.example.com;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 512m;
  }
}
```

```bash
PUBLIC_BASE_URL=https://podcast.example.com
```

## Frontend routes & SPA fallback (History)

The web app uses the **HTML5 History API** (no `#`): paths look like `/home`, `/play/<id>`, `/settings`.

- **Single-port prod / Docker**: the Node server serves static assets; unknown frontend paths fall back to `index.html` (SPA fallback) with global SEO injection.
- **Legacy hash links**: `/#/tags` is automatically migrated to `/tags`.
- **Reverse proxy**: proxy the site root to the app port (Nginx sketch above). If you host `web/dist` separately, add SPA fallback yourself, e.g.:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Missing extension assets (`.js` / `.css` / images) return 404 instead of HTML.

## Global SEO

- Settings → **Site**: custom title, description, keywords (description keeps `Powered by BokeBox` + repo attribution).
- Server injects `title` / `description` / Open Graph / Twitter Card / `canonical` / `og:url` / `og:image` into `index.html`.
- Set `PUBLIC_BASE_URL=https://your.domain` so canonical and share images use absolute URLs.

## Health


```bash
curl -s http://127.0.0.1:8787/api/health
```

## Backup

- Entire `storage/` (db, media, plugins)  
- `.env` (never commit secrets)  

## Stop

```bash
pnpm docker:down
# or ./start.sh docker:down
```


## Docs site (Vercel)

Production docs: <https://bkb-docs.aiuo.net/>

Use Vercel only (GitHub Actions only **builds** docs for CI, does not publish Pages).

**Recommended: Root Directory = `docs`**

- Build: `pnpm docs:build`
- Output: `.vitepress/dist`
- Config: `docs/vercel.json`

**Or empty Root (monorepo root)**

- Build: `pnpm --filter @bokebox/docs run build:docs`
- Output: `docs/.vitepress/dist`
- Config: root `vercel.json`

Do not set `DOCS_BASE=/BokeBox/`.


## Related

- [Configuration](./configuration.md)
- [Docker CI/CD](../ops/ci-cd.md)
- [Getting started](./getting-started.md)
