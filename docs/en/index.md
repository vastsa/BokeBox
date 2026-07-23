---
description: BokeBox docs — English quick map (full guides are in Chinese for now).
---

# BokeBox Docs (English map)

> Full narrative guides are currently **Simplified Chinese**.  
> Repo: <https://github.com/vastsa/BokeBox> · License: **LGPL-3.0-only**

**BokeBox** turns videos, links, articles, meeting notes, and more into a **private AI podcast** you can actually finish — custom persona & voice, MCP, pluggable sources, self-hosted.

## Quick commands

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env
./start.sh                 # dev UI, usually http://localhost:5173

# Docker (prebuilt)
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker          # http://localhost:8787

# This documentation site
pnpm docs:dev
```

## Doc map (Chinese pages)

| Topic | Page |
| --- | --- |
| Getting started | [/guide/getting-started](/guide/getting-started) |
| First episode | [/guide/first-episode](/guide/first-episode) |
| Features | [/guide/features](/guide/features) |
| Pipeline | [/guide/pipeline](/guide/pipeline) |
| Schedules | [/guide/schedule](/guide/schedule) |
| Configuration | [/guide/configuration](/guide/configuration) |
| Deployment | [/guide/deployment](/guide/deployment) |
| MCP | [/guide/mcp](/guide/mcp) |
| FAQ | [/guide/faq](/guide/faq) |
| Architecture | [/guide/architecture](/guide/architecture) |
| Plugins overview | [/plugins/](/plugins/) |
| Source / ASR-TTS / Schedule | [/plugins/source](/plugins/source) · [/plugins/asr-tts](/plugins/asr-tts) · [/plugins/schedule](/plugins/schedule) |
| Plugin development | [/development/](/development/) |
| Examples | [/development/examples](/development/examples) |
| CI/CD | [/ops/ci-cd](/ops/ci-cd) |

## MCP (short)

- Endpoint: `POST /mcp` with Bearer token from **Settings → MCP**
- Jobs: `create_podcast_from_url`, `create_podcast_from_text`, `list_jobs`, `get_job`, …
- Schedules: `list_schedules`, `create_schedule`, `run_schedule_now`, …

See [/guide/mcp](/guide/mcp) for the full table.

## Help improve EN docs

Translations welcome — see [/development/contributing-docs](/development/contributing-docs).
