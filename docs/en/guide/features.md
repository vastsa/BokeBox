---
description: BokeBox feature map — pipeline, listening, plugins, MCP.
---

# Features

Aligned with Settings, job detail, and the listening library.

## Multi-source input

- Local upload: video / audio / text  
- URL import: article extract, public media links  
- Optional Source plugin or auto-match  
- Album, persona, voice at create time  
- Schedules: RSS / URL lists / Schedule plugins  

## AI production pipeline

- Extract → ASR → spoken script → cover / notes / flashcards → TTS  
- Async jobs with progress on home  
- Re-run from a step; skip completed work  
- Publish to library, retry failures, delete jobs  

## Persona · voice · prompts

- Global host persona + per-episode override  
- Preset voices + text Voice Design  
- Prompt templates: cover / spoken / rewrite / flashcards  
- Content language global or per job  

## Episode assets

- Transcript, script, notes, flashcards, cover, audio  
- AI covers (custom cover prompts)  
- Flashcards for active recall  
- Tags & summaries; star-map browse  

## Listening

- Player: progress memory, speed, sleep timer (incl. “end of episode”)  
- Albums & continuous play  
- Star map by theme  
- Library coexists with production jobs  

## Settings

| Section | Role |
| --- | --- |
| **Voice** | Default TTS for new jobs |
| **Persona** | Default host & show |
| **Prompts** | Cover / spoken / rewrite / flashcard templates |
| **AI services** | Credentials, models, providers |
| **Plugins** | Source / ASR / TTS / Schedule |
| **Schedules** | Timed ingest |
| **MCP** | Token & install snippets |
| **Site** | Name, SEO, guest access |
| **Account** | UI language, theme, password |

## Schedules

- Settings → Schedules: pull on a cadence and create jobs  
- Model: plugin + params + cron (timezone)  
- Built-ins: RSS/Atom, URL list, GitHub Trending, Hacker News, …  
- Dedupe + per-run caps; run now / force  
- See [Schedules](./schedule.md)

## Plugin system

- **Source** — content ingest (`storage/plugins/source/`)  
- **ASR / TTS** — swap providers  
- **Schedule** — timed candidates  
- Rescan, zip install, config in Settings  

## MCP

Built-in endpoint with long-lived token. Tools: [MCP](./mcp.md).

## Deploy & privacy

- `./start.sh` / `./start.sh prod` / Docker  
- Local SQLite + `storage/`  
- LGPL-3.0 · <https://github.com/vastsa/BokeBox>

## Further reading

- [First episode](./first-episode.md)
- [Pipeline](./pipeline.md)
- [Schedules](./schedule.md)
- [MCP](./mcp.md)
- [FAQ](./faq.md)
