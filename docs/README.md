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

## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
