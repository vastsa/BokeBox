---
description: Develop external Source plugins for BokeBox.
---

# Source plugin development

> External content plugins under `storage/plugins/source/*`  
> Repo: <https://github.com/vastsa/BokeBox> · License: LGPL-3.0 · `apiVersion = 1`

Overview: [Source plugins](../plugins/source.md). Example: [source-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo).

## Principles

1. Core only consumes `SourceArtifact` — high-risk fetch stays in plugins  
2. Default off when `riskLevel: "high"`  
3. Declare real `permissions` only  
4. Hot-load via rescan after drop-in  

## Layout

```text
storage/plugins/source/<dir>/
  plugin.json
  index.js
  README.md        # recommended
```

```bash
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo
```

## Manifest essentials

`id`, `name`, `version`, `entry`, `apiVersion`, `riskLevel`, `capabilities`, `defaultEnabled`, `permissions`, optional `configSchema`.

## Runtime

Export a plugin object implementing the host Source contract (match URL / import → `SourceArtifact`). Prefer host-injected helpers when provided.

## API

| Method | Path |
| --- | --- |
| GET | `/api/source-plugins` |
| POST | `/api/source-plugins/rescan` |
| PATCH | `/api/source-plugins/:id` |
| PUT | `/api/source-plugins/:id/config` |

## Full Chinese reference

The complete field-by-field contract lives in the Chinese guide (same repo path):

- Source (ZH): [/development/source-plugin](/development/source-plugin)
- GitHub: [docs/development/source-plugin.md](https://github.com/vastsa/BokeBox/blob/main/docs/development/source-plugin.md)
