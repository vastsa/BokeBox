---
description: Start BokeBox in three steps — local dev, Docker, and the docs site.
---

# Getting started

> Full product copy: [README.md](https://github.com/vastsa/BokeBox/blob/main/README.md).  
> Repo: <https://github.com/vastsa/BokeBox> · License: LGPL-3.0

First launch walks you through **account init** and model setup.

## Requirements

- Node.js `>= 22.5`
- pnpm `9.x` (pinned via `packageManager`)
- Optional: Docker / Docker Compose

## Local dev

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env   # fill in API keys
./start.sh             # open http://localhost:5173
```

Or:

```bash
pnpm install
pnpm dev
```

- Web: address printed in the terminal (usually `http://localhost:5173`)
- API: default `http://localhost:8787`

Keys and models: [Configuration](./configuration.md).

## Docker (quick)

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# http://localhost:8787
```

More options (local build, CN mirrors, reverse proxy): [Deployment](./deployment.md).

## First episode

1. Open the site and finish onboarding  
2. Confirm AI services under Settings  
3. Drop a link / upload a draft or video  
4. When the pipeline finishes, play from the library  

Step-by-step: **[First episode](./first-episode.md)**.  
Pipeline stages: [Pipeline](./pipeline.md).  
AI clients: [MCP](./mcp.md).

## This docs site

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Next

- [Settings](./settings.md) — settings map  
- [Introduction](./introduction.md) — product positioning  
- [Features](./features.md) — capability list  
- [Architecture](./architecture.md) — data flow  
- [Plugins](../plugins/) — extend sources & voices  
- [Docker CI/CD](../ops/ci-cd.md) — image publishing  
