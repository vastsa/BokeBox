---
description: ASR and TTS plugins for BokeBox.
---

# ASR / TTS plugins

ASR / TTS / Source share **plugin-kit** infrastructure; business interfaces differ by capability.

- Layout: `storage/plugins/{asr|tts}/<dir>/plugin.json` + ESM entry  
- Enable / config / rescan hot load  
- Built-ins registered in code; externals scanned locally  
- Admin API + Settings UI  

## Directories

```text
storage/plugins/
  source/
  asr/
  tts/
```

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/asr-plugins` | List |
| POST | `/api/asr-plugins/rescan` | Rescan |
| PATCH | `/api/asr-plugins/:id` | `{ "enabled": true/false }` |
| POST | `/api/asr-plugins/:id/reset` | Restore defaultEnabled |
| PUT | `/api/asr-plugins/:id/config` | Save params |
| POST | `/api/asr-plugins/:id/config/reset` | Clear params |

For TTS, use `/api/tts-plugins` prefix.

## TTS development

Full contract: **[TTS plugin development](../development/tts-plugin.md)**.

Examples:

- [`examples/tts-plugin-echo`](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo)
- [`examples/tts-plugin-fishspeech`](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech) — Fish Audio cloud or self-hosted Fish Speech

## Related

- [Plugins overview](./index.md)
- [Install & manage](../development/plugin-install.md)
- [Examples](../development/examples.md)

## Related

- [ASR development](../development/asr-plugin.md)
- [TTS development](../development/tts-plugin.md)
- [Install & manage](../development/plugin-install.md)
- [Examples](../development/examples.md)

## Host TTS synthesis

- One sentence per `synthesizeChunk` (split on `。！？!?` / newlines)
- `maxCharsPerRequest` only hard-splits oversized sentences
- Style/mood tags planned per sentence (global base + scene-aware controls), not only the first

