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

仓库根目录已提供 `vercel.json`：

| 项 | 值 |
| --- | --- |
| Install | `pnpm install` |
| Build | `pnpm docs:build` |
| Output | `docs/.vitepress/dist` |
| cleanUrls | `true`（匹配 VitePress `cleanUrls`） |

**注意：**

1. Vercel 项目 **Root Directory 留空**（monorepo 根），不要填 `docs`  
2. **不要**设置 `DOCS_BASE=/BokeBox/`（那是 GitHub Pages 项目路径用的）。Vercel 自定义域 / `*.vercel.app` 使用默认 `base: '/'`  
3. 若仍 404：在 Vercel 部署日志确认 Output 里有 `index.html`，并 Redeploy  

### GitHub Pages

```bash
DOCS_BASE=/BokeBox/ pnpm docs:build
```

见 `.github/workflows/docs.yml`。

## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
