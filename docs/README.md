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

**正式文档站：Vercel** → <https://bkb-docs.aiuo.net/>

仓库提供：

| 文件 | 场景 |
| --- | --- |
| `docs/vercel.json` | Vercel Root Directory = `docs`（推荐） |
| `vercel.json` | Vercel Root 留空（monorepo 根） |

推荐配置（Root = `docs`）：

| 项 | 值 |
| --- | --- |
| Install | `pnpm install` |
| Build | `pnpm docs:build` |
| Output | `.vitepress/dist` |
| cleanUrls | `true` |

**不要**设置 `DOCS_BASE=/BokeBox/`（仅旧 GitHub 项目页路径需要）。Vercel 自定义域使用 `base: '/'`。

GitHub Actions（`docs` workflow）**只做构建校验**，不再部署 GitHub Pages。



## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
