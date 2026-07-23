---
description: Source plugins — content ingest architecture.
---

# Source plugins

> Persistence & config validation share `plugin-kit` (`namespace=source`, legacy `source_plugin_*` keys).

> **Writing a plugin?** See [Source plugin development](../development/source-plugin.md).

## Goal

Peel “content acquisition” out of the pipeline so the core only consumes a unified `SourceArtifact`.

High-risk fetch (Firecrawl / yt-dlp, etc.) stays **optional external plugins**, off by default.

## Architecture

```text
apps/server/src/sources/
  types.ts        # SourceArtifact / SourcePlugin / Manifest
  registry.ts     # register, enable, match
  state.ts        # enable state (app_settings)
  loader.ts       # scan storage/plugins/source
  host.ts         # importSource / refreshExternal
  plugins/
    directHttp.ts # built-in low-risk plugin

storage/plugins/source/<dir>/
  plugin.json
  index.js
```

## Built-in vs external

| Type | Location | Default |
| --- | --- | --- |
| builtin `direct-http` | in code | enabled |
| external | `storage/plugins/source/*` | follows manifest; high risk forced off |

## plugin.json (essentials)

Typical fields: `id`, `name`, `version`, `entry`, `apiVersion`, `description`, `riskLevel`, `capabilities`, `defaultEnabled`, `permissions`, `configSchema`.

See the [development guide](../development/source-plugin.md) for the full contract.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/source-plugins` | List |
| POST | `/api/source-plugins/rescan` | Hot scan |
| PATCH | `/api/source-plugins/:id` | `{ "enabled": true/false }` |
| POST | `/api/source-plugins/:id/reset` | Clear enable override |
| PUT | `/api/source-plugins/:id/config` | Save `{ "config": { ... } }` |
| POST | `/api/source-plugins/:id/config/reset` | Clear config |

## Matching

At create time you can pin a Source plugin id or let the host **auto-match** by URL / capabilities.

## Related

- [Source development](../development/source-plugin.md)
- Example: [`examples/source-plugin-echo`](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo)
- [ASR / TTS plugins](./asr-tts.md) (same kit)
- [Install & manage](../development/plugin-install.md)
