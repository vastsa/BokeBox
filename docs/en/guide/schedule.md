---
description: BokeBox schedules — RSS, charts, Schedule plugins, run history, and Source ingest.
---

# Schedules

**Settings → Schedules**: discover content on a cadence and create podcast jobs that enter the [Pipeline](./pipeline.md).

## Two layers (important)

A schedule is **not** one plugin doing everything:

| Layer | Plugin kind | Role |
| --- | --- | --- |
| **Discover** | Schedule plugins | Emit candidates (`key` / `url` / `title`…) |
| **Ingest** | Source plugins | Download/parse the URL, then ASR → script → TTS |

- Schedule plugins **only emit URLs**; they do not write job media.  
- Ingest **auto-matches** an enabled Source plugin by default (often built-in `direct-http`).  
- You can **pin a Source plugin** per schedule (`jobDefaults.sourcePluginId`).  
- Never use `schedule.*` as a Source plugin id.

```text
schedule due
  → Schedule plugin fetch candidates
  → dedupe / caps / run record
  → createJob(sourceUrl)
  → pipeline → Source ingest → episode
```

## Unified model

Each schedule ≈:

```text
schedule plugin (pluginId)
+ optional params (overrides only)
+ cadence (preset / cron + timezone)
+ job defaults (album, title prefix, Source plugin…)
+ limits (maxItemsPerRun, onlyNew)
```

Sketch (live API / Settings win if names differ):

```json
{
  "name": "My blog",
  "kind": "plugin",
  "sourceConfig": {
    "pluginId": "schedule.rss",
    "params": { "feedUrl": "https://example.com/feed.xml" }
  },
  "preset": "daily",
  "cron": "0 8 * * *",
  "timezone": "Asia/Shanghai",
  "jobDefaults": {
    "albumId": null,
    "titlePrefix": "Daily · ",
    "sourcePluginId": null,
    "published": true
  },
  "limits": {
    "maxItemsPerRun": 3,
    "onlyNew": true
  }
}
```

### Params

- Plugins with `configSchema` get a **dynamic form** in Settings.  
- **Leave empty when you have nothing to override** — empty fields / `{}` are **not saved**.  
- Unset keys fall back to **plugin hub** config at runtime (`ctx.getConfig`).  
- Schema-less custom plugins may use optional JSON; also optional.

## Built-in schedule plugins

| pluginId | Notes | Typical params |
| --- | --- | --- |
| `schedule.rss` | RSS / Atom | `{ "feedUrl": "https://…" }` (required) |
| `schedule.url-list` | Fixed URL list | `{ "urls": ["https://…"] }` (required) |
| `schedule.github-trending` | GitHub Trending | `since` / `language` / `spokenLanguage` |
| `schedule.hacker-news` | Hacker News | `feed`: top / new / best / ask / show / job |

External dir: `storage/plugins/schedule/` (zip install).  
Dev: [Schedule plugin development](../development/schedule-plugin.md) · Product: [Schedule plugins](../plugins/schedule.md)

## Cadence

| preset | Meaning (default tz `Asia/Shanghai`) |
| --- | --- |
| `hourly` | Every hour |
| `every_6h` | Every 6 hours |
| `daily` | Daily 08:00 |
| `weekly` | Monday 08:00 |
| `cron` | Custom 5-field cron |

## Settings UI

1. Pick **schedule plugin** + params (dynamic form)  
2. Cadence / timezone, album, title prefix, max items, only-new  
3. Optional: **Source plugin** (default auto-match)  
4. **Run now** / **Force run** (skip dedupe)  
5. **Run history**: expand rounds; open a round for status, duration, stats, full errors, job ids (jump to job)  
6. Enable / disable / edit / delete  

## Scheduling notes

- In-process scheduler ticks ~**30s**; limited parallelism per tick.  
- Designed for **single instance**; multi-replica needs an external lock (not built-in).  
- Pre-claims `next_run` when a run starts; recovers stuck `running` on boot.  
- Dedupe: `schedule_seen_items` (only after **successful job create**).  
- Ledger: `schedule_runs`.  
- Disabled plugins advance `next_run` to avoid hot loops.

## MCP

| Tool | Role |
| --- | --- |
| `list_schedules` | List |
| `get_schedule` | Detail + recent runs |
| `create_schedule` | Create (`pluginId`, optional `params` / `sourcePluginId`, cadence) |
| `run_schedule_now` | One cycle (`force` skips dedupe) |
| `list_schedule_plugins` | Available schedule plugins |

### Examples

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
  "sourcePluginId": "source.direct-http",
  "maxItemsPerRun": 2
}
```

Omit empty `params` entirely.

## See also

- [Pipeline](./pipeline.md)  
- [Settings](./settings.md)  
- [MCP](./mcp.md)  
- [Schedule plugins](../plugins/schedule.md)  
- [Source plugins](../plugins/source.md)  
