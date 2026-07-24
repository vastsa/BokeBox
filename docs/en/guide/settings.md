---
description: BokeBox Settings sections map.
---

# Settings

After login, **Settings** centralizes defaults, plugins, MCP, and site options.

## Sections

| Section | What you do |
| --- | --- |
| **Voice** | Default TTS; presets / Voice Design |
| **Persona** | Default host, audience, show vibe |
| **Prompts** | Cover / spoken / rewrite / flashcard templates |
| **AI services** | Credentials, base URL, model IDs |
| **Plugins** | Source / ASR / TTS / Schedule scan, toggle, config, upload |
| **Schedules** | Schedule plugin & params, cadence, Source pin, run now/force, run history |
| **MCP** | Token & client install snippets |
| **Site** | Site name, SEO, guest access |
| **Account** | UI language, theme (system / light / dark), password, open-source info |

Many AI/deploy values also via [Configuration](./configuration.md).

## Suggested order

```text
1. AI services   → models work
2. Voice / persona
3. One episode   → prove pipeline
4. Plugins / schedules
5. MCP
6. Site / account before public exposure
```

## Related docs

- [First episode](./first-episode.md)
- [Pipeline](./pipeline.md)
- [Schedules](./schedule.md)

### Schedules tab

- **Schedule** plugins discover URLs; **Source** plugins ingest (auto-match or pin).
- Params are optional overrides only.
- Run history links to created jobs. Full guide: [Schedules](./schedule.md).
- [MCP](./mcp.md)
- [Install plugins](../development/plugin-install.md)

## UI

<div class="bokebox-gallery">
  <figure>
    <img src="/img/persona.webp" alt="Persona" />
    <figcaption>Persona</figcaption>
  </figure>
  <figure>
    <img src="/img/plugins.webp" alt="Plugins" />
    <figcaption>Plugins</figcaption>
  </figure>
  <figure>
    <img src="/img/mcp.webp" alt="MCP" />
    <figcaption>MCP</figcaption>
  </figure>
  <figure>
    <img src="/img/schedules.webp" alt="Schedules" />
    <figcaption>Schedules</figcaption>
  </figure>
  <figure>
    <img src="/img/site.webp" alt="Site" />
    <figcaption>Site</figcaption>
  </figure>
</div>
