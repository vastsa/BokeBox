---
description: Develop external TTS plugins for BokeBox.
---

# TTS plugin development

> `storage/plugins/tts/*` · LGPL-3.0 · host `apiVersion` per manifest

Overview: [ASR / TTS plugins](../plugins/asr-tts.md).

Examples:

- [tts-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo)
- [tts-plugin-fishspeech](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech)

## Layout

```text
storage/plugins/tts/<dir>/
  plugin.json
  index.js
```

## Role

Synthesize spoken-script segments to audio the host can stitch. Surface voices/config via `configSchema` for Settings UI.

## API prefix

`/api/tts-plugins` (list / rescan / enable / config) — same kit as Source.

## Full Chinese reference

- [/development/tts-plugin](/development/tts-plugin)
- [docs/development/tts-plugin.md](https://github.com/vastsa/BokeBox/blob/main/docs/development/tts-plugin.md)

## Host synthesis behavior

- Split on `。！？!?` and newlines: **one sentence → one `synthesizeChunk` call**
- `maxCharsPerRequest` only hard-splits an oversized single sentence
- Style/mood tags are planned **per sentence** (global base + scene controls like laugh/serious/breath), not a single opening-only tag
- Host synthesizes segments sequentially, inserts inter-sentence silence, merges audio, and writes `podcast.srt`

