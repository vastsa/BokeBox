---
description: Source / ASR / TTS / Schedule plugin system overview.
---

# Plugins

BokeBox splits replaceable capabilities into four plugin kinds that share **plugin-kit** (enable/disable, config, manifest loading). Business APIs differ by capability.

## Four kinds

| Kind | Role | Directory | Docs |
| --- | --- | --- | --- |
| **Source** | Ingest → unified `SourceArtifact` | `storage/plugins/source/` | [Guide](./source.md) · [Dev](../development/source-plugin.md) |
| **ASR** | Speech-to-text | `storage/plugins/asr/` | [Guide](./asr-tts.md) · [Dev](../development/asr-plugin.md) |
| **TTS** | Text-to-speech | `storage/plugins/tts/` | [Guide](./asr-tts.md) · [Dev](../development/tts-plugin.md) |
| **Schedule** | Timed candidate URLs | `storage/plugins/schedule/` | [Guide](./schedule.md) · [Dev](../development/schedule-plugin.md) |

## Principles

1. **Core consumes contracts only** — high-risk fetch / third-party charts stay optional plugins  
2. **Least privilege by default** — `riskLevel: high` forces default off  
3. **Hot plug** — drop into directory or zip upload, then Settings rescan  
4. **Runnable examples** — repo `examples/*-plugin-*`

## Management

- Web: **Settings → Plugins**
- API: `/api/{source|asr|tts|schedule}-plugins` (list / rescan / toggle / config / install)

## Install

- [Install & manage](../development/plugin-install.md)
- [Examples catalog](../development/examples.md)

## Next

Read the product guide for architecture, then the dev guide to implement.
