---
description: Install, scan, enable, and configure BokeBox plugins.
---

# Install & manage plugins

## Layout

```text
storage/plugins/{source|asr|tts|schedule}/<dir>/
  plugin.json
  index.js   # or entry from manifest
```

`storage/plugins/**` is local (not committed by default).

## Install

```bash
mkdir -p storage/plugins/source
cp -R /path/to/plugin storage/plugins/source/my-plugin
```

Or upload zip under **Settings → Plugins** (when available).

## Rescan

- UI: **Rescan**
- API: `POST /api/{source|asr|tts|schedule}-plugins/rescan`

## Toggle & config (Source example)

| Action | API |
| --- | --- |
| List | `GET /api/source-plugins` |
| Enable | `PATCH /api/source-plugins/:id` `{"enabled":true}` |
| Reset enable | `POST /api/source-plugins/:id/reset` |
| Save config | `PUT /api/source-plugins/:id/config` `{"config":{...}}` |
| Clear config | `POST /api/source-plugins/:id/config/reset` |

Swap prefix for `asr` / `tts` / `schedule`.

## Risk

`riskLevel: "high"` → forced default **off**.

## Related

- [Examples](./examples.md)
- [Source dev](./source-plugin.md)
- [TTS dev](./tts-plugin.md)
- [Schedule dev](./schedule-plugin.md)
