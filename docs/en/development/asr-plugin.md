---
description: Develop external ASR plugins for BokeBox.
---

# ASR plugin development

> External speech-to-text plugins under `storage/plugins/asr/*`  
> Repo: <https://github.com/vastsa/BokeBox> · License: LGPL-3.0 · `apiVersion = 1`

Overview: [ASR / TTS plugins](../plugins/asr-tts.md).  
Example: [asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo).  
TTS: [TTS plugins](./tts-plugin.md).

Chinese full guide (same content family): [/development/asr-plugin](/development/asr-plugin)

---

## Principles

1. **Only audio → text** — no Job writes, no SQLite, no cron  
2. **Input is a local path** — `input.audioPath` prepared by the host  
3. **Strict activation** — runtime uses Settings `asrProvider`; fail loud on misconfig  
4. **Default off / least privilege** — prefer `defaultEnabled: false`  
5. **Hot reload** — drop into `storage/plugins/asr/<dir>/` then rescan  

---

## Layout

```text
storage/plugins/asr/<dir>/
  plugin.json
  index.js
```

```bash
cp -R examples/asr-plugin-echo storage/plugins/asr/echo
curl -s -X POST http://localhost:8787/api/asr-plugins/rescan
curl -s -X PATCH http://localhost:8787/api/asr-plugins/asr.echo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

Set as current under **Settings → Plugins** or set `asrProvider` in **AI services**.

---

## plugin.json

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | e.g. `asr.myprovider` |
| `name` / `version` / `entry` | yes | ESM entry relative to dir |
| `apiVersion` | yes | `1` |
| `riskLevel` | recommended | `low` \| `medium` \| `high` |
| `defaultEnabled` | recommended | usually `false` |
| `permissions` | no | e.g. `config`, `network` |
| `suggestedModel` | no | UI hint |
| `configSchema` | no | Settings form fields |

---

## Export contract

Loader requires:

- `name`, `version`, `riskLevel`, `defaultEnabled`  
- `isAvailable(): boolean`  
- `async transcribe(input, ctx)`  

### Input

| Field | Notes |
| --- | --- |
| `audioPath` | required local file |
| `format` | optional `mp3` / `wav` / … |
| `model` | optional override |
| `language` | optional hint |

### Output

| Field | Notes |
| --- | --- |
| `text` | required transcript |
| `provider` | usually plugin id |
| `model` | optional |
| `demo` | optional |

### Context

`storageDir`, `config`, `getConfig(key)`, optional `signal` (`AbortSignal`).

### Minimal plugin

```js
import fs from 'node:fs/promises';

export default {
  id: 'asr.myprovider',
  name: 'My ASR',
  version: '0.1.0',
  riskLevel: 'medium',
  defaultEnabled: false,
  isAvailable() {
    return true;
  },
  async transcribe(input, ctx) {
    const audioPath = String(input?.audioPath || '');
    if (!audioPath) throw new Error('audioPath required');
    await fs.access(audioPath);
    const apiKey = String(ctx?.getConfig?.('apiKey') || '').trim();
    if (!apiKey) throw new Error('Configure apiKey in plugin settings');
    // call your API with the file at audioPath …
    return {
      text: '…',
      provider: 'asr.myprovider',
      model: 'my-model',
    };
  },
};
```

---

## API

| Method | Path |
| --- | --- |
| GET | `/api/asr-plugins` |
| POST | `/api/asr-plugins/rescan` |
| PATCH | `/api/asr-plugins/:id` |
| PUT | `/api/asr-plugins/:id/config` |

---

## Checklist

1. Manifest + ESM export valid  
2. Rescan lists plugin without `loadError`  
3. Enable + set `asrProvider`  
4. Run a video/audio job through transcribe  
5. Missing credentials produce a clear error  

## Related

- [Install & manage](./plugin-install.md)
- [Examples](./examples.md)
- [TTS development](./tts-plugin.md)
