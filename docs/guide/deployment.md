---
description: BokeBox 本地与 Docker 部署指南。
---

# 部署

BokeBox 面向 **单用户私有部署**：数据与媒体默认落在本地 `storage/`。

## 方式对比

| 方式 | 适用 | 命令 |
| --- | --- | --- |
| 本地开发 | 改代码、联调 | `./start.sh` 或 `pnpm dev` |
| 生产单端口 | 本机 / 小服务器，Node 直跑 | `./start.sh prod` |
| Docker 预构建镜像 | 推荐上线 | `./start.sh docker` |
| Docker 本地构建 | 改 Dockerfile / 未用 GHCR | `./start.sh docker.local` |
| Docker 国内构建 | 大陆服务器拉基础镜像慢 | `./start.sh docker.cn` |

## 开发模式

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env
./start.sh
```

- Web 开发服：通常 `http://localhost:5173`
- API：默认 `http://localhost:8787`
- 首次访问完成账号初始化与模型配置

## 生产单端口

```bash
cp .env.example .env
# 配置密钥与模型
./start.sh prod
```

会构建前端并由 server 统一提供静态资源 + API（端口见 `PORT`）。

## Docker：预构建镜像（推荐）

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# 访问 http://localhost:8787
```

等价思路：

```bash
docker compose up -d
```

默认将 `./storage` 挂到容器内，重启不丢任务与听播进度。

### 镜像与 Tag

```text
ghcr.io/vastsa/bokebox:latest
ghcr.io/vastsa/bokebox:sha-<short>
```

发布流水线见 [Docker CI/CD](../ops/ci-cd.md)。

## Docker：本地源码构建

```bash
cp .env.example .env
./start.sh docker.local
```

## Docker：国内构建

```bash
cp .env.example .env
./start.sh docker.cn
```

使用国内可访问的 Node / apt / npm 源，并安装系统 ffmpeg，避免构建期外网超时。可选变量见 [配置与环境变量](./configuration.md)。

## 反向代理

示例（Nginx 思路）：

```nginx
server {
  listen 443 ssl http2;
  server_name podcast.example.com;

  # ssl_certificate ...;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 上传大文件时按需调大
    client_max_body_size 512m;
  }
}
```

并在 `.env` 设置：

```bash
PUBLIC_BASE_URL=https://podcast.example.com
```

以便 MCP 安装配置生成正确外网地址。

## 健康检查

```bash
curl -s http://127.0.0.1:8787/api/health
```

Compose 内置同类 healthcheck。

## 备份建议

至少备份：

- `storage/` 整个目录（含 `app.db`、jobs 媒体、插件）
- `.env`（密钥，勿提交仓库）

## 停止

```bash
pnpm docker:down
# 或
./start.sh docker:down
```


## 文档站（Vercel）

静态文档，与应用 Docker 无关。

**推荐：Vercel Root Directory = `docs`**

- Build：`pnpm docs:build`
- Output：`.vitepress/dist`
- 配置见 `docs/vercel.json`

**或 Root 留空（仓库根）**

- Build：`pnpm --filter @bokebox/docs run build:docs`
- Output：`docs/.vitepress/dist`
- 配置见根目录 `vercel.json`

不要设置 `DOCS_BASE=/BokeBox/`。若日志出现 `docs:build not found`，把 Root Directory 与 Build 命令按上表对齐后 Redeploy。


## 相关

- [配置与环境变量](./configuration.md)
- [Docker CI/CD](../ops/ci-cd.md)
- [快速开始](./getting-started.md)
