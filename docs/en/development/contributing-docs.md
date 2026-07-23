---
description: How to contribute to the BokeBox docs site.
---

# Contributing docs

Docs live in monorepo `docs/` (VitePress) with **i18n**:

- Chinese (default): repo root of `docs/` (`/`)
- English: `docs/en/` (`/en/`)

## Preview

```bash
pnpm install
pnpm docs:dev
```

## Add a page

1. Add `.md` under `guide/`, `plugins/`, `development/`, or `ops/` (and mirror under `en/` when possible)  
2. Optional frontmatter `description`  
3. Register in `.vitepress/config.mts` nav/sidebar for **both** locales  
4. `pnpm docs:build`  

## Scripts

Use `dev:docs` / `build:docs` / `preview:docs` — not bare `dev`/`build`, so monorepo `pnpm -r` does not start the docs site.


## Keep docs in sync with features

Root `AGENTS.md` requires: **any feature add / change / remove must update docs in the same task** (including `docs/en` and nav). When changing product code, check guide / plugins / development pages for staleness.

## License

Contributions follow **LGPL-3.0-only**. Keep `https://github.com/vastsa/BokeBox` attribution.
