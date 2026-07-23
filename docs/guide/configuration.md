---
description: BokeBox 环境变量与配置说明。
---

# 配置与环境变量

> 完整示例见仓库根目录 [`.env.example`](https://github.com/vastsa/BokeBox/blob/main/.env.example)。  
> 首次启动若无 `.env`，`./start.sh` 会从 `.env.example` 自动复制。

## 快速配置

```bash
cp .env.example .env
# 编辑 .env，至少填入 OPENAI_API_KEY
```

多数 AI 相关项也可在 **设置 → AI 服务** 中调整；环境变量适合部署期注入与 Docker。

## 服务端口与前端

| 变量 | 说明 | 默认 / 示例 |
| --- | --- | --- |
| `PORT` | API（与生产单端口）监听端口 | `8787` |
| `HOST` | 监听地址（Docker 内常用 `0.0.0.0`） | 由运行方式决定 |
| `VITE_API_BASE` | 前端请求 API 的前缀 | `/api` |
| `PUBLIC_BASE_URL` | 对外根地址；生成 MCP 安装配置时使用。不填则按请求 Host 推断 | 空 |

经反向代理（Nginx / Caddy 等）暴露时，建议设置：

```bash
PUBLIC_BASE_URL=https://podcast.example.com
```

## AI / OpenAI 兼容接口

BokeBox 使用 OpenAI 兼容的 Chat / ASR / TTS / Image 接口，可通过 `OPENAI_BASE_URL` 指向任意兼容提供方。

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 接口密钥 | `sk-...` |
| `OPENAI_BASE_URL` | API 根路径 | `https://api.openai.com/v1` |
| `OPENAI_CHAT_MODEL` | 口播稿 / 闪卡等对话模型 | 按提供方填写 |
| `OPENAI_TRANSCRIBE_MODEL` | ASR 模型 | 按提供方填写 |
| `OPENAI_TTS_MODEL` | TTS 模型 | 按提供方填写 |
| `OPENAI_TTS_VOICEDESIGN_MODEL` | Voice Design 模型（可选） | 按提供方填写 |
| `OPENAI_TTS_DEFAULT_VOICE` | 默认音色名 | 如 `alloy` / 中文音色名 |
| `OPENAI_IMAGE_MODEL` | 封面图模型（可选） | 空则可能走其它封面策略 |

> 示例值会随提供方变化，以你实际可用的模型 ID 为准。

## Docker 国内构建（可选）

仅 `./start.sh docker.cn` / 对应 Dockerfile 构建时有用：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `NODE_IMAGE` | 基础 Node 镜像 | `docker.m.daocloud.io/library/node:22-bookworm-slim` |
| `APT_MIRROR` | apt 镜像 | `mirrors.aliyun.com` |
| `NPM_REGISTRY` | npm 源 | `https://registry.npmmirror.com` |

## 运行时路径（镜像 / 高级）

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `BOKEBOX_ROOT` | 应用根 | monorepo 根 |
| `WEB_DIST` | 前端静态目录 | `apps/web/dist` |
| `STORAGE_DIR` | 数据目录 | `$BOKEBOX_ROOT/storage` |

Docker Compose 默认将宿主机 `./storage` 挂载到容器 `/app/storage`，任务媒体与 SQLite 会持久化在这里。

## 存储目录约定

```text
storage/
  jobs/           # 按任务聚合的媒体与中间产物
  albums/         # 专辑相关
  plugins/
    source/       # 外部 Source 插件
    asr/          # 外部 ASR 插件
    tts/          # 外部 TTS 插件
    schedule/     # 外部订阅插件
  app.db*         # SQLite（运行期生成，勿提交）
```

插件安装与开发见 [插件说明](../plugins/source.md) 与 [开发规范](../development/source-plugin.md)。

## 相关文档

- [快速开始](./getting-started.md)
- [部署](./deployment.md)
- [MCP 接入](./mcp.md)
- [Docker CI/CD](../ops/ci-cd.md)
