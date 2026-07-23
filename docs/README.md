# BokeBox 文档站

基于 [VitePress](https://vitepress.dev/) 的项目文档。

## 本地开发

在 monorepo 根目录：

```bash
pnpm install
pnpm docs:dev
```

或在 `docs/` 下：

```bash
pnpm dev
```

## 构建 / 预览

```bash
pnpm docs:build
pnpm docs:preview
```

构建产物：`docs/.vitepress/dist`。

GitHub Pages 构建时设置：

```bash
DOCS_BASE=/BokeBox/ pnpm docs:build
```

## 目录结构

```text
docs/
  .vitepress/
    config.mts          # 站点配置、导航、侧栏
    theme/              # 品牌色与自定义样式
  index.md              # 首页
  guide/                # 入门与使用（开始 / 功能 / 配置 / 部署 / MCP / 架构）
  plugins/              # 插件说明
  development/          # 插件开发 + Design Tokens
  ops/                  # 运维 / CI
  img/                  # 截图与 Logo（README 共用）
  public/img -> ../img  # 站点静态资源
```

根目录若干 `docs/*.md` 为 **兼容跳转页**，保留 README 与外链旧路径。

## 写作约定

- 正文用简体中文；代码与 CLI 保持原样  
- 仓库 / 协议链接保留：`https://github.com/vastsa/BokeBox`、LGPL-3.0  
- 示例与 apps 源码优先链到 GitHub，避免文档站 dead link  
- 新页面记得挂到 `.vitepress/config.mts` 的 `nav` / `sidebar`

## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
