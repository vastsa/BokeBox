# Docker CI/CD

基于 GitHub Actions + GHCR 的镜像构建与可选 SSH 部署。

## 流水线概览

```
PR / push
  ├─ check     pnpm install + 全量 build
  └─ docker    构建镜像
                 ├─ PR: load + /api/health 冒烟
                 └─ main / tag / 手动: 推送 GHCR (linux/amd64 + arm64)

main push / 手动 deploy
  └─ deploy    SSH 到生产机 pull + compose up（需 secrets）
```

## 镜像地址

```
ghcr.io/<owner>/<repo>
# 例: ghcr.io/vastsa/bokebox
```

常用 tag：

| Tag | 含义 |
|-----|------|
| `latest` | `main` 分支最新构建 |
| `sha-<short>` | 对应 commit |
| `1.2.3` | git tag `v1.2.3` |
| `1.2` | semver 次版本 |

## 触发条件

| 事件 | check | 构建 | 推送 GHCR | 部署 |
|------|-------|------|-----------|------|
| PR → main | ✅ | ✅ amd64 | ❌ | ❌ |
| push main | ✅ | ✅ multi-arch | ✅ | 可选 |
| tag `v*` | ✅ | ✅ multi-arch | ✅ | ❌ |
| 手动 workflow_dispatch | ✅ | ✅ | 可选 | 可选 |

## 镜像体积说明

官方 `Dockerfile` 采用激进瘦身：

1. **最终层 `node:22-alpine`**（比 bookworm-slim 小一截）
2. **`pnpm deploy` 导出最小 server 运行闭包**，最终层不带 monorepo / pnpm store
3. **ffmpeg-static 单文件**，避免 apt/apk ffmpeg 共享库全家桶
4. 清理 docs / tests / source map

并支持环境变量布局：

| 变量 | 含义 | 默认 |
|------|------|------|
| `BOKEBOX_ROOT` | 应用根 | monorepo 根 |
| `WEB_DIST` | 前端静态目录 | `apps/web/dist` |
| `STORAGE_DIR` | 数据目录 | `$BOKEBOX_ROOT/storage` |

本地检查体积：

```bash
docker build -t bokebox:local .
docker image ls bokebox:local
```


## 本地验证

```bash
# 推荐：直接拉取预构建镜像
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker

# 本地源码构建
./start.sh docker.local
# 等价:
# docker compose -f docker-compose.local.yml up -d --build
# 或:
# docker build -t bokebox:local .
# docker run --rm -p 8787:8787 --env-file .env bokebox:local
```

## 生产机拉取（推荐）

1. 服务器准备目录与配置：

```bash
mkdir -p ~/bokebox && cd ~/bokebox
# 放入 docker-compose.prod.yml 与 .env
# 确保存储目录
mkdir -p storage/jobs
```

2. 若镜像为 private，先登录 GHCR：

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u USERNAME --password-stdin
```

PAT 权限：`read:packages`（推送 CI 已用 `GITHUB_TOKEN`）。

3. 启动：

```bash
export GHCR_IMAGE=ghcr.io/vastsa/bokebox
export IMAGE_TAG=latest
docker pull ghcr.io/vastsa/bokebox:latest
docker compose -f docker-compose.prod.yml up -d
# 或默认 compose:
# docker compose up -d
```

## 可选：自动 SSH 部署

在仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret | 必填 | 说明 |
|--------|------|------|
| `DEPLOY_HOST` | ✅ | 服务器 IP / 域名 |
| `DEPLOY_USER` | ✅ | SSH 用户 |
| `DEPLOY_SSH_KEY` | ✅ | 私钥全文 |
| `DEPLOY_PORT` | | SSH 端口，默认 22 |
| `DEPLOY_PATH` | | 部署目录，默认 `~/bokebox` |
| `GHCR_PULL_TOKEN` | 私有包时 | 服务器 pull 用 PAT |
| `GHCR_PULL_USER` | | 默认仓库 owner |

并创建 Environment 名：`production`（workflow 已引用）。

服务器 `DEPLOY_PATH` 下需预先放好：

- `docker-compose.prod.yml`
- `.env`
- `storage/` 目录（数据卷）

未配置 secrets 时 deploy job 会跳过，不影响镜像推送。

## 发布版本 tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

将生成 `ghcr.io/.../bokebox:1.0.0` 与 `1.0`。

## 权限说明

- CI 推送：`packages: write` + 默认 `GITHUB_TOKEN`
- 首次使用 GHCR 后，如需公开拉取：

  仓库 GitHub Packages 页面 → Package settings → Change visibility → Public
