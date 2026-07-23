# BokeBox 文档站

基于 [VitePress](https://vitepress.dev/) 的项目文档。

## 本地开发

在 monorepo 根目录：

```bash
pnpm install
pnpm docs:dev
```

## 构建 / 预览

```bash
pnpm docs:build
pnpm docs:preview
```

构建产物：`docs/.vitepress/dist`。

GitHub Pages：

```bash
DOCS_BASE=/BokeBox/ pnpm docs:build
```

可选：`DOCS_SITE_URL` 影响 sitemap 的 hostname。

## 信息架构

```text
guide/           用户指南
  getting-started / first-episode / introduction / features / faq
  pipeline / schedule / mcp
  architecture / configuration / deployment
plugins/         插件产品说明
development/     插件开发 · Tokens · 贡献文档
ops/             CI/CD
img/             截图（README 共用）
```

根级 `source-plugins.md` 等为 **GitHub 兼容跳转页**，不进入站点构建（`srcExclude`）。


## 部署

### Vercel（推荐文档站）

支持两种 Root Directory（二选一）：

**方式 A — Root Directory = `docs`（推荐，与本次报错场景匹配）**

使用 `docs/vercel.json`：

| 项 | 值 |
| --- | --- |
| Install | `pnpm install` |
| Build | `pnpm docs:build` |
| Output | `.vitepress/dist` |

**方式 B — Root Directory 留空（monorepo 根）**

使用仓库根 `vercel.json`：

| 项 | 值 |
| --- | --- |
| Install | `pnpm install` |
| Build | `pnpm --filter @bokebox/docs run build:docs` |
| Output | `docs/.vitepress/dist` |

**注意：**

1. **不要**设置 `DOCS_BASE=/BokeBox/`（仅 GitHub Pages 子路径需要）  
2. 若 Build 报 `Command "docs:build" not found`：说明当前在 monorepo 根却跑了 docs 子包命令，或 Root 配错——按上面 A/B 对齐  
3. Redeploy 后确认产物含 `index.html`  

### GitHub Pages

```bash
DOCS_BASE=/BokeBox/ pnpm docs:build
```

见 `.github/workflows/docs.yml`。

## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
