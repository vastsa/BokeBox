---
description: BokeBox plugin development entry.
---

# Plugin development

For authors extending BokeBox. License **LGPL-3.0** — keep attribution.

## Start here

- [Examples catalog](./examples.md) — repo `examples/`
- [Install & manage](./plugin-install.md) — copy / zip / rescan / toggle

## Paths

| Goal | Doc | Example |
| --- | --- | --- |
| New content source | [Source plugins](./source-plugin.md) | [source-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo) |
| New ASR provider | [ASR plugins](./asr-plugin.md) | [asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo) |
| New TTS provider | [TTS plugins](./tts-plugin.md) | [tts-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo) · [fishspeech](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech) |
| Timed candidates | [Schedule plugins](./schedule-plugin.md) | [schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo) |
| Web visual tokens | [Design Tokens](./web-design-tokens.md) | `apps/web/src/styles/index.css` |

## Conventions

- Dir: `storage/plugins/<kind>/<dir>/plugin.json` + ESM entry  
- See each guide for `apiVersion`  
- Prefer host `ctx.safeFetch` when required  
- Do not write SQLite or own cron inside schedule plugins  

## Background

- [Architecture](../guide/architecture.md)
- [Plugins overview](../plugins/)
- [Contributing docs](./contributing-docs.md)
