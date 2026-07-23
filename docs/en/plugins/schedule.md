---
description: Schedule subscription plugins.
---

# Schedule plugins

> Shares `plugin-kit` (`namespace=schedule`).  
> **Writing a plugin?** → [Schedule plugin development](../development/schedule-plugin.md)

## Goal

Pull “where candidates come from” out of the scheduler:

- Core: cron + dedupe + create jobs  
- Plugins: RSS, charts, third-party APIs, custom sources  

## Architecture

```text
apps/server/src/services/schedule/plugins/
  types.ts / registry.ts / loader.ts / host.ts / config/state

storage/plugins/schedule/<dir>/
  plugin.json
  index.js
```

## Built-in plugins

| id | Role | Default |
| --- | --- | --- |
| `schedule.rss` | RSS/Atom | on |
| `schedule.url-list` | Fixed URL list | on |

(Also shipping built-ins such as GitHub Trending / Hacker News — see Settings and MCP `list_schedule_plugins`.)

## Unified model (Settings → Schedules)

Each row is **plugin + params + cadence** — no special-case “is this a plugin?”.

Product guide: [Schedules](../guide/schedule.md).

## Install examples

```bash
cp -R examples/schedule-plugin-github-trending \
  storage/plugins/schedule/github-trending
```

- [`schedule-plugin-echo`](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo)
- [`schedule-plugin-github-trending`](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending)

## Related

- [Schedule development](../development/schedule-plugin.md)
- [Plugins overview](./index.md)
