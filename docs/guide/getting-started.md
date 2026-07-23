---
description: 三步启动 BokeBox：本地开发、Docker 与文档站预览。
---

# 快速开始

> 演示站：<https://bokebox.aiuo.net/> · 在线文档：<https://bkb-docs.aiuo.net/>


> 更完整的产品说明见仓库 [README.zh-CN.md](https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md)。  
> 仓库：<https://github.com/vastsa/BokeBox> · 协议：LGPL-3.0

三步开箱。首次进入会引导你完成 **账号初始化** 与模型配置。

## 环境要求

- Node.js `>= 22.5`
- pnpm `9.x`（仓库已锁定 `packageManager`）
- 可选：Docker / Docker Compose

## 本地启动

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env   # 填入你的 API Key
./start.sh             # 打开 http://localhost:5173
```

或使用 pnpm 脚本：

```bash
pnpm install
pnpm dev
```

- Web：终端输出的本地地址（通常 `http://localhost:5173`）
- API：默认 `http://localhost:8787`

密钥与模型变量说明见 [配置与环境变量](./configuration.md)。

## Docker 一键

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# 访问 http://localhost:8787
```

更多方式（本地构建、国内源、反向代理）见 [部署](./deployment.md)。

## 第一期节目

1. 浏览器打开站点，完成初始化  
2. 在设置中确认 AI 服务可用  
3. 丢一条链接 / 上传文稿或视频  
4. 等流水线跑完，在听播库打开播放  

分步图文式说明见 **[做完第一期节目](./first-episode.md)**。  
流水线阶段说明见 [制作流水线](./pipeline.md)。  
想用 AI 客户端直接创建任务？看 [MCP 接入](./mcp.md)。

## 文档站（本站）

```bash
pnpm docs:dev      # 本地热更新
pnpm docs:build    # 构建静态站 → docs/.vitepress/dist
pnpm docs:preview  # 预览构建产物
```

## 下一步

- [设置中心](./settings.md) — 各设置分区
- [项目介绍](./introduction.md) — 产品定位  
- [功能清单](./features.md) — 能力全景  
- [架构概览](./architecture.md) — 数据流与 monorepo  
- [插件体系](../plugins/) — 扩展内容源与音色  
- [Docker CI/CD](../ops/ci-cd.md) — 镜像发布  
