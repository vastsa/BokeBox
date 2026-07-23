# 快速开始

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

## Docker

### 拉取预构建镜像（推荐）

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# 访问 http://localhost:8787
```

### 本地源码构建

```bash
cp .env.example .env
./start.sh docker.local
```

### 国内镜像构建（大陆服务器）

```bash
cp .env.example .env
./start.sh docker.cn
# 使用 DaoCloud Node 镜像 + 阿里云 apt + npmmirror
# 系统安装 ffmpeg，避免 GitHub 下载超时
```

停止：

```bash
pnpm docker:down
# 或
./start.sh docker:down
```

## 环境变量

完整变量清单见仓库根目录 [`.env.example`](https://github.com/vastsa/BokeBox/blob/main/.env.example)。

常见项：

| 变量 | 说明 |
| --- | --- |
| 模型 / API Key | LLM、TTS 等提供方密钥 |
| 端口 | Web / API 监听端口 |
| 存储路径 | 任务媒体与数据库位置（默认 `storage/`） |

镜像发布与 CI 说明见 [Docker CI/CD](../ops/ci-cd.md)。

## 文档站（本站）

在 monorepo 内预览文档：

```bash
pnpm docs:dev      # 本地热更新
pnpm docs:build    # 构建静态站
pnpm docs:preview  # 预览构建产物
```

## 下一步

- [项目介绍](./introduction.md) — 产品定位与架构
- [Source 插件](../plugins/source.md) — 扩展内容源
- [ASR / TTS 插件](../plugins/asr-tts.md) — 转写与合成
- [Schedule 订阅](../plugins/schedule.md) — 定时进匣
- [插件开发总入口](../development/source-plugin.md) — 写自己的插件
