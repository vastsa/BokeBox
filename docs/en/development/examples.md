---
description: BokeBox example plugins catalog.
---

# Examples catalog

Repo [`examples/`](https://github.com/vastsa/BokeBox/tree/main/examples).

| Directory | Kind | Notes |
| --- | --- | --- |
| [source-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo) | Source | `echo:text` demo artifact |
| [asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo) | ASR | Stub |
| [tts-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo) | TTS | Stub / preset grid |
| [tts-plugin-fishspeech](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech) | TTS | Fish Audio / self-hosted |
| [schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo) | Schedule | Demo candidates |
| [schedule-plugin-github-trending](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending) | Schedule | GitHub Trending |

## Install (from repo root)

```bash
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo
```

Then **Settings → Plugins → Rescan** and enable.

See [Install & manage](./plugin-install.md).
