---
description: Finish your first private BokeBox episode from scratch.
---

# First episode

Assumes you followed [Getting started](./getting-started.md) and finished account init.

## 1. Confirm AI services

Open **Settings → AI services** (or check `OPENAI_*` in `.env`):

- API key / base URL work  
- Chat / ASR / TTS model IDs match your provider  
- Image model optional (covers)  

Or call MCP `get_system_health`. Partition map: [Settings](./settings.md).

## 2. (Optional) Persona & voice

| Setting | Role |
| --- | --- |
| **Persona** | Who hosts, who they talk to, show vibe |
| **Voice** | Default TTS; presets or Voice Design |
| **Prompts** | Cover / spoken / rewrite / flashcard templates |

Defaults are fine for a first run.

## 3. Drop content in

Home / create supports:

- **URL** — public articles, direct media links  
- **Local files** — video / audio / text  
- **Plain text** — notes, meeting minutes  

Optional: Source plugin, album, per-episode persona / voice / locale.

## 4. Wait for the pipeline

```text
Ingest → extract audio → ASR → spoken script
      → cover / flashcards → TTS → library
```

- Progress on the home job list  
- Retry or re-run from a step (skip completed)  
- Text inputs skip ASR  

Details: [Pipeline](./pipeline.md).

## 5. Listen & organize

- Job detail: transcript, script, notes, flashcards, cover, audio  
- **Library**: immersive player (progress, speed, sleep timer)  
- **Albums / star map**: themes  

## 6. Level up

- [Schedules](./schedule.md) — RSS / charts on a timer  
- [MCP](./mcp.md) — create shows from Cursor  
- [Plugins](../plugins/) — more sources & voices  

## Common snags

| Symptom | Check |
| --- | --- |
| Stuck on ASR | ASR model / key; decodable media |
| Thin script | Source too short; persona / prompt |
| No audio | TTS model & voice name; job error |
| URL fetch fails | Login wall / non-direct → Source plugin or local upload |

More: [FAQ](./faq.md).
