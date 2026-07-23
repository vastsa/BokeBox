---
description: BokeBox schedules — RSS, charts, and Schedule plugins.
---

# Schedules

**Settings → Schedules**: pull content on a cadence and create podcast jobs.

## Unified model

Each schedule = **schedule plugin + params + cron** (optional timezone). Content ingest auto-matches a **Source** plugin by default; you can pin one in Settings.

```json
{
  "pluginId": "schedule.rss",
  "params": { "feedUrl": "https://example.com/feed.xml" },
  "cron": "0 8 * * *",
  "timezone": "Asia/Shanghai"
}
```

(Field names follow the live API / Settings UI.)

## Built-in capabilities

| Capability | Notes |
| --- | --- |
| RSS / Atom | Blogs, news, podcast feeds |
| URL list | Fixed URLs polled |
| GitHub Trending | Built-in plugin |
| Hacker News | Built-in plugin |

External plugins: `storage/plugins/schedule/` (zip upload supported).  
Dev: [Schedule plugins](../development/schedule-plugin.md) · Product: [Schedule plugins](../plugins/schedule.md)

## Built-in pluginId reference

| pluginId | Typical params |
| --- | --- |
| `schedule.rss` | `{ "feedUrl": "https://example.com/feed.xml" }` |
| `schedule.url-list` | `{ "urls": ["https://a.com", "https://b.com"] }` |
| `schedule.github-trending` | `{ "since": "daily", "language": "TypeScript" }` (see plugin) |
| `schedule.hacker-news` | `{ "feed": "top" }` (see plugin) |

Cadence: `preset` = `hourly` / `every_6h` / `daily` / `weekly` / `cron`; plus `timezone` (default `Asia/Shanghai`).

## Behavior

- **Dedupe** via seen items  
- **Caps** per run (`maxItemsPerRun`)  
- **Run now / force** for debug or backfill  
- **Run history** stored in `schedule_runs` (status / fetched / created / skipped / errors / jobIds); expand in Settings and open jobs  
- **Retry-friendly**: only successful job creates mark seen; failures retry next cycle, or force-run to ignore dedupe  
- Plugins **only emit candidate URLs** — jobs use the [Pipeline](./pipeline.md)

## MCP

| Tool | Role |
| --- | --- |
| `list_schedules` | List schedules |
| `get_schedule` | Detail + recent runs |
| `create_schedule` | Create (plugin + params + cadence) |
| `run_schedule_now` | Run one cycle (`force` skips dedupe) |
| `list_schedule_plugins` | Available schedule plugins |

### create_schedule examples

```json
{
  "name": "My blog",
  "pluginId": "schedule.rss",
  "feedUrl": "https://example.com/feed.xml",
  "preset": "daily",
  "timezone": "Asia/Shanghai",
  "maxItemsPerRun": 3,
  "onlyNew": true
}
```

```json
{
  "name": "HN Top",
  "pluginId": "schedule.hacker-news",
  "params": { "feed": "top" },
  "preset": "every_6h",
  "maxItemsPerRun": 5
}
```

Full tool table: [MCP](./mcp.md).

## Related

- [Plugins](../plugins/)
- [Features](./features.md)
- [First episode](./first-episode.md)
