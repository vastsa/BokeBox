---
description: Develop Schedule subscription plugins for BokeBox.
---

# Schedule plugin development

> `storage/plugins/schedule/*` · plugins only emit candidates; host dedupes, rate-limits, creates jobs

Product: [Schedules](../guide/schedule.md) · [Schedule plugins](../plugins/schedule.md).

Examples:

- [schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo)
- [schedule-plugin-github-trending](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending)

## Principles

1. Output candidate items (`https?` URL + stable `key`) only  
2. No Job creation / SQLite / own cron  
3. High risk → default off  
4. Prefer `ctx.safeFetch` when networking  

## Layout

```text
storage/plugins/schedule/<dir>/
  plugin.json
  index.js
```

## API

`/api/schedule-plugins` — list, rescan, install zip, enable, config, uninstall package.

## Full Chinese reference

- [/development/schedule-plugin](/development/schedule-plugin)
- [docs/development/schedule-plugin.md](https://github.com/vastsa/BokeBox/blob/main/docs/development/schedule-plugin.md)
