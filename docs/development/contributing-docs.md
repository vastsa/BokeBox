---
description: 如何为 BokeBox 文档站贡献内容。
---

# 贡献文档

文档站位于 monorepo 的 `docs/`，基于 VitePress。

## 本地预览

```bash
pnpm install
pnpm docs:dev
```

## 目录约定

| 目录 | 用途 |
| --- | --- |
| `guide/` | 用户指南（开始、使用、部署、FAQ） |
| `plugins/` | 插件产品说明 |
| `development/` | 插件开发与前端 Token |
| `ops/` | CI/CD 等运维 |
| `img/` | 截图（与 README 共用） |
| 根级 `*-plugins.md` 等 | **兼容跳转**，勿写正文 |

## 加新页面

1. 在对应目录新建 `.md`  
2. 建议 frontmatter：

```md
---
description: 一句话摘要
---
```

3. 挂到 `.vitepress/config.mts` 的 `nav` / `sidebar`  
4. 如有需要，更新 `docs/index.md` 导航表  
5. `pnpm docs:build` 确认无 dead link  

## 写作风格

- 简体中文；语气直接、可扫读  
- 保留仓库与协议：`https://github.com/vastsa/BokeBox`、LGPL-3.0  
- 示例代码与 monorepo 路径链到 GitHub，避免文档站构建死链  
- 不在文档中提交密钥、真实 Token  

## 脚本注意

`@bokebox/docs` 使用 `dev:docs` / `build:docs` / `preview:docs`，**不要**命名为 `dev`/`build`，以免被根目录 `pnpm -r dev/build` 误启动。

## 协议

贡献内容随本仓库 **LGPL-3.0-only** 开源。
