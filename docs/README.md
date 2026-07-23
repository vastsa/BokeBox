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

## 目录结构

```text
docs/
  .vitepress/config.mts   # 站点配置、导航、侧栏
  index.md                # 首页
  guide/                  # 入门
  plugins/                # 插件说明
  development/            # 开发规范
  ops/                    # 运维 / CI
  img/                    # 截图与 Logo（README 共用）
  public/img -> ../img    # 站点静态资源
```

根目录若干 `docs/*.md` 为 **兼容跳转页**，保留 README 与外链旧路径。

## 协议与归属

- 仓库：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0-only
