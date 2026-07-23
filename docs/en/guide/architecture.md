---
description: BokeBox architecture, monorepo, and data flow.
---

# Architecture

## One sentence

Multi-source content enters via **Source / Schedule**, becomes unified artifacts, runs the **Job Pipeline** (ASR → script → cover/cards → TTS), then the library. **MCP** and Web share the same server capabilities.

## Data flow

```text
  video / link / draft           RSS / charts / custom
           │                            │
           ▼                            ▼
    ┌──────────────┐             ┌──────────────┐
    │ Source plugin│             │ Schedule     │
    │ + built-in   │             │ cron + dedupe│
    └──────┬───────┘             └──────┬───────┘
           │   SourceArtifact           │ URLs
           └───────────┬────────────────┘
                       ▼
              ┌────────────────┐
              │  Job Pipeline  │
              └────────┬───────┘
                       ▼
              Library / player
```

## Monorepo

```text
apps/server     API, pipeline, plugin host, MCP, SQLite
apps/web        React UI
packages/shared Shared types
docs/           VitePress (this site)
examples/       Plugin samples
storage/        Runtime data & external plugins
```

## Server services

| Area | Role |
| --- | --- |
| `settings/` | Global settings |
| `import/` | URL & local import |
| `job/` | Jobs, pipeline, listen progress |
| `media/` | Extract, ASR, TTS, covers |
| `content/` | Script, flashcards, prompts |
| `album/` | Albums |
| `auth/` | Login / bootstrap |
| `mcp/` | MCP protocol & tools |
| `schedule/` | Timed subscriptions |
| `plugins/` | Plugin management |

## Plugin host

Source / ASR / TTS / Schedule share **plugin-kit** (enable, config, manifest load).

```text
storage/plugins/{source,asr,tts,schedule}/<dir>/
```

- Built-in: code-registered  
- External: scan / zip + Settings rescan  

## Frontend

Vite + React. Tokens: [Design Tokens](../development/web-design-tokens.md).

## Related

- [Introduction](./introduction.md)
- [Features](./features.md)
- [MCP](./mcp.md)
- [Deployment](./deployment.md)
