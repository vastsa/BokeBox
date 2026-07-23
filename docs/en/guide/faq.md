---
description: BokeBox FAQ and troubleshooting.
---

# FAQ

## Product

### How is this different from “TTS reading an article”?

Content is **rewritten into spoken structure** (open, highlights, close) under your persona, not raw read-aloud.

### Where is my data?

Default **single-user private deploy** — jobs, progress, media under local `storage/`.  
Your configured AI provider receives API traffic for ASR / chat / TTS as needed.

### License?

**LGPL-3.0-only** — <https://github.com/vastsa/BokeBox>

## Install & deploy

### Minimum env?

Node `>= 22.5`, pnpm 9.x — or Docker.

### Can’t pull the image?

- Network to `ghcr.io`  
- `./start.sh docker.local`  
- In CN: `./start.sh docker.cn`  

### Change port?

`.env` → `PORT` (default `8787`). [Configuration](./configuration.md).

### MCP URL wrong behind proxy?

Set `PUBLIC_BASE_URL=https://your.domain`.

## Models

### Must I use OpenAI official?

No. Any **OpenAI-compatible** Chat / ASR / TTS via `OPENAI_BASE_URL`.

### Demo mode?

When critical models are missing, degraded/demo paths may run — check `get_system_health` and UI hints.

## Jobs

### Stuck on a stage?

1. Job detail error text  
2. Matching model (ASR / Chat / TTS)  
3. Retry / re-run from that step  
4. Server logs  

### Only regenerate audio?

Re-run from **TTS / synthesize**, reusing the script if still present.

### URL fetch fails?

Login walls / anti-bot → local upload or a custom Source plugin.

## Plugins

### Where do they live?

```text
storage/plugins/{source|asr|tts|schedule}/<dir>/
```

Rescan in Settings or `POST /api/...-plugins/rescan`.

### High-risk plugins off by default?

Yes when `riskLevel: high`.

## MCP

### Token leaked?

Rotate/reset under **Settings → MCP**; scrub client configs from public repos.

## Docs site

```bash
pnpm docs:dev
```

Language switcher: **简体中文 / English** in the nav.

Settings map: [Settings](./settings.md).

## Still stuck?

Issues: <https://github.com/vastsa/BokeBox/issues>  
Include version, run mode (Docker/pnpm), redacted logs.
