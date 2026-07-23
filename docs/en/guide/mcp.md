---
description: BokeBox MCP endpoint, token, and tools.
---

# MCP

Built-in **Model Context Protocol** endpoint for Cursor / Claude Desktop / Codex — create episodes, query jobs, manage schedules.

The server **auto-issues a long-lived token** after start.

## Endpoint

| Item | Value |
| --- | --- |
| Protocol | `POST /mcp` (Bearer token) |
| Install payload | `GET /api/mcp/install` (logged in) or **Settings → MCP** |
| Protocol version | `2024-11-05` |

Optional `PUBLIC_BASE_URL` for correct install URLs behind a reverse proxy: [Configuration](./configuration.md).

## Client config

### Cursor

```json
{
  "mcpServers": {
    "bokebox": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer <token from Settings → MCP>"
      }
    }
  }
}
```

Use your real origin + `/mcp`.

### Other clients

Settings usually provides Cursor / Claude Desktop / Codex snippets.

## Tools

### Jobs & library

| Tool | Role |
| --- | --- |
| `create_podcast_from_url` | Create job from URL; optional Source plugin, title, locale, publish |
| `create_podcast_from_text` | Create job from text body |
| `list_jobs` | List jobs (status filter, limit) |
| `get_job` | Detail; optional full script / transcript / notes / cards |
| `update_job` | Title or publish state |
| `retry_job` | Retry / re-run steps |
| `delete_job` | Delete job + media |
| `list_library` | Published library items |
| `get_system_health` | Health, AI config, demo mode |

### Schedules

| Tool | Role |
| --- | --- |
| `list_schedules` | List schedules |
| `get_schedule` | One schedule + runs |
| `create_schedule` | Create schedule |
| `run_schedule_now` | Run now |
| `list_schedule_plugins` | Schedule plugins |

Product: [Schedules](./schedule.md).

## Typical flows

```text
# One episode
create_podcast_from_url / create_podcast_from_text
        │
        ▼
   list_jobs / get_job
        │
        ▼
   list_library

# One feed
list_schedule_plugins → create_schedule → run_schedule_now
        │
        ▼
   list_jobs
```

## Security

- Treat the token like account access — **never commit it**  
- Lock down public exposure with firewall / reverse proxy auth  
- Rotate via **Settings → MCP** when needed  

## Related

- [First episode](./first-episode.md)
- [Schedules](./schedule.md)
- [Configuration](./configuration.md)
- Code: [`apps/server/src/services/mcp/`](https://github.com/vastsa/BokeBox/tree/main/apps/server/src/services/mcp)
