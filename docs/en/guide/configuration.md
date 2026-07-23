---
description: BokeBox environment variables and configuration.
---

# Configuration

> Full sample: [`.env.example`](https://github.com/vastsa/BokeBox/blob/main/.env.example).  
> If `.env` is missing, `./start.sh` copies from `.env.example`.

## Quick setup

```bash
cp .env.example .env
# at least OPENAI_API_KEY
```

Most AI options can also be set under **Settings → AI services**. Env vars fit deploy/Docker injection.

## Port & frontend

| Variable | Role | Default / example |
| --- | --- | --- |
| `PORT` | API / prod single-port | `8787` |
| `HOST` | Bind address (Docker often `0.0.0.0`) | runtime-dependent |
| `VITE_API_BASE` | Frontend API prefix | `/api` |
| `PUBLIC_BASE_URL` | Public origin for MCP install URLs | empty → infer Host |

Behind Nginx/Caddy:

```bash
PUBLIC_BASE_URL=https://podcast.example.com
```

## OpenAI-compatible AI

| Variable | Role |
| --- | --- |
| `OPENAI_API_KEY` | API key |
| `OPENAI_BASE_URL` | API root (any OpenAI-compatible host) |
| `OPENAI_CHAT_MODEL` | Script / flashcards chat model |
| `OPENAI_TRANSCRIBE_MODEL` | ASR model |
| `OPENAI_TTS_MODEL` | TTS model |
| `OPENAI_TTS_VOICEDESIGN_MODEL` | Voice Design (optional) |
| `OPENAI_TTS_DEFAULT_VOICE` | Default voice name |
| `OPENAI_IMAGE_MODEL` | Cover image model (optional) |

Use model IDs your provider actually exposes.

## Docker CN build (optional)

For `./start.sh docker.cn`:

| Variable | Example |
| --- | --- |
| `NODE_IMAGE` | `docker.m.daocloud.io/library/node:22-bookworm-slim` |
| `APT_MIRROR` | `mirrors.aliyun.com` |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` |

## Runtime paths (advanced / image)

| Variable | Meaning | Default |
| --- | --- | --- |
| `BOKEBOX_ROOT` | App root | monorepo root |
| `WEB_DIST` | Frontend dist | `apps/web/dist` |
| `STORAGE_DIR` | Data dir | `$BOKEBOX_ROOT/storage` |

Compose mounts `./storage` → `/app/storage` by default.

## Storage layout

```text
storage/
  jobs/
  albums/
  plugins/{source,asr,tts,schedule}/
  app.db*          # runtime; do not commit
```

## Related

- [Getting started](./getting-started.md)
- [Deployment](./deployment.md)
- [MCP](./mcp.md)
- [Docker CI/CD](../ops/ci-cd.md)
