---
description: BokeBox 常见问题与排查。
---

# 常见问题

## 产品与定位

### BokeBox 和「TTS 读文章」有什么区别？

会先把内容 **重写成口播结构**（开场、重点、收尾），再按人设与音色合成，而不是直接念原文。

### 数据在哪？会上传到你们的云吗？

默认 **单用户私有部署**，任务、进度与媒体在本地 `storage/`（SQLite + 文件）。  
你配置的 AI 提供方会收到转写 / 写稿 / TTS 等 API 请求，这是调用模型所必需的。

### 开源协议是什么？

**LGPL-3.0-only**。仓库：<https://github.com/vastsa/BokeBox>

## 安装与部署

### 最低环境？

Node.js `>= 22.5`，pnpm 9.x；或 Docker。

### Docker 拉不下镜像？

- 检查对 `ghcr.io` 的网络  
- 使用 `./start.sh docker.local` 本地构建  
- 大陆服务器可试 `./start.sh docker.cn`

### 端口怎么改？

`.env` 中 `PORT`（默认 `8787`）。详见 [配置](./configuration.md)。

### 反向代理后 MCP 地址不对？

设置 `PUBLIC_BASE_URL=https://你的域名`。


### 为什么地址栏没有 `#`？刷新深链会不会 404？

前端已改为 **History 路由**（`/home`、`/play/...`）。生产单端口与 Docker 由服务端做 **伪静态回退**（未知路径返回 `index.html`）。  
若你只托管静态文件，需自行配置 SPA fallback（见 [部署](./deployment.md)）。旧 `#/path` 链接会自动迁移。

### 如何配置站点 SEO？

设置 → **站点**：标题 / 描述 / 关键词。分享卡片依赖服务端注入的 Open Graph 字段；公网部署请设置 `PUBLIC_BASE_URL`。

## 模型与密钥

### 必须用 OpenAI 官方吗？

不必须。任何 **OpenAI 兼容** 的 Chat / ASR / TTS 端点都可，通过 `OPENAI_BASE_URL` 指向。

### Demo 模式是什么？

当关键能力未配置或不可用时，可能以降级 / 演示路径运行（以 `get_system_health` 与界面提示为准）。完整成片质量仍依赖真实模型。

## 任务与流水线

### 任务卡在某一阶段？

1. 打开任务详情看错误文案  
2. 检查对应模型（ASR / Chat / TTS）  
3. 使用「重试」或从该步骤重跑  
4. 仍失败 → 看 server 日志  

### 可以只换音色重生成音频吗？

可以：从 **合成 / TTS** 步骤重跑，复用已有口播稿（若产物仍在）。

### 链接抓取失败？

- 需登录、付费墙、强反爬：改用本地上传或自建 Source 插件  
- 非媒体直链：依赖 Source 插件解析能力  

## 插件

### 插件放哪？

```text
storage/plugins/{source|asr|tts|schedule}/<dir>/
```

设置页 **重新扫描** 或调用对应 `POST /api/...-plugins/rescan`。

### 高风险插件默认关？

是。`riskLevel: high` 时宿主强制默认不启用，需手动打开。

## MCP

### Token 泄露了怎么办？

在 **设置 → MCP** 按界面能力轮换 / 重置（以当前版本为准），并检查客户端配置是否进了公开仓库。

### 和「订阅 MCP 工具」的关系？

任务类工具管 Job；`list_schedules` / `create_schedule` / `run_schedule_now` 等管订阅。  
订阅插件只负责发现链接；内容采集由 Source 插件完成。见 [定时订阅](./schedule.md) · [MCP](./mcp.md)。

## 文档站

### 如何本地预览文档？

```bash
pnpm docs:dev
```

### 旧的 `docs/xxx.md` 链接失效了吗？

仍保留兼容跳转页；正文在 `guide/` / `plugins/` / `development/` / `ops/` 下。

设置分区说明见 [设置中心](./settings.md)。

## 还解决不了？

- Issues：<https://github.com/vastsa/BokeBox/issues>  
- 附上：版本 / 运行方式（Docker 或 pnpm）/ 相关日志（打码 Key）  
