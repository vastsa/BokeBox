---
description: BokeBox job production pipeline stages.
---

# Pipeline

Each episode is a **Job**. The pipeline runs async on the server; Web and MCP share it.

## Stages

```text
1. Ingest          Source plugin or built-in import → SourceArtifact
2. Extract audio   Video demux / audio normalize (text may skip)
3. ASR             Speech → text (text may skip)
4. Spoken script   Transcript/body → structured script + notes
5. Cover           Optional AI image
6. Flashcards      Review cards from content
7. TTS             Script → audio
8. Publish         Library (configurable default)
```

## Input differences

| Source | Extract | ASR | Script |
| --- | --- | --- | --- |
| Video | ✅ | ✅ | From transcript |
| Audio | Normalize | ✅ | From transcript |
| Text / plain | Silent placeholder OK | Skip | From body |
| URL | Depends on Source kind | By kind | Same |

## Re-run & reuse

Re-run from a step (e.g. script only or TTS only). Upstream artifacts can be **reused**. MCP: `retry_job`.

## Failures

- Errors surface on job detail / list  
- Transient provider errors → retry  
- Config issues → fix [Configuration](./configuration.md) first  

## Schedules

[Schedules](./schedule.md) only produce candidate URLs and create Jobs — then this pipeline runs.

## Code (developers)

- [`apps/server/src/services/job/`](https://github.com/vastsa/BokeBox/tree/main/apps/server/src/services/job)
- Media: `services/media/` · Content: `services/content/`

## Related

- [First episode](./first-episode.md)
- [Features](./features.md)
- [Architecture](./architecture.md)
