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

## 前端路由与伪静态（History）

Web 使用 **History 模式**（无 `#`）：路径形如 `/home`、`/play/<id>`、`/settings`。

- **单端口生产 / Docker**：由 Node 服务统一托管静态资源；未知前端路径回退 `index.html`（伪静态 SPA fallback），并注入全局 SEO。
- **旧链接兼容**：访问 `/#/tags` 等 hash 链接时，前端会自动迁移为 `/tags`。
- **反向代理**：只要把站点根代理到应用端口（见上文 Nginx 示例）即可，**无需**再写 `try_files`；若你拆开静态托管（仅托管 `web/dist`），则需自行配置 SPA 回退，例如：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

带扩展名的静态资源（`.js` / `.css` / 图片等）缺失时返回 404，不会误回退 HTML。

## 全局 SEO

- 设置 → **站点**：可自定义标题、描述、关键词；描述会保留 `Powered by BokeBox` 与仓库出处。
- 服务端在返回 `index.html` 时注入 `title` / `description` / Open Graph / Twitter Card / `canonical` / `og:url` / `og:image`。
- 建议配置 `PUBLIC_BASE_URL=https://你的域名`，以便 canonical 与分享图使用绝对地址。

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

正式地址：<https://bkb-docs.aiuo.net/>

仅使用 **Vercel** 发布文档。GitHub Actions 的 `docs` 工作流只做构建校验，**不再**部署 GitHub Pages。

**推荐：Root Directory = `docs`**

- Build：`pnpm docs:build`
- Output：`.vitepress/dist`
- 配置：`docs/vercel.json`

**或 Root 留空（仓库根）**

- Build：`pnpm --filter @bokebox/docs run build:docs`
- Output：`docs/.vitepress/dist`
- 配置：根目录 `vercel.json`

不要设置 `DOCS_BASE=/BokeBox/`。


## 相关

- [配置与环境变量](./configuration.md)
- [Docker CI/CD](../ops/ci-cd.md)
- [快速开始](./getting-started.md)
