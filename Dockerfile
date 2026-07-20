# BokeBox · 生产镜像（体积收敛）
# 目标：小于「系统 ffmpeg 全家桶」方案；GHCR 构建环境可拉 ffmpeg-static。
#
# 关键策略：
# 1) 不用 apt 装 ffmpeg（共享库链路很大，曾把镜像顶到 ~780MB+）
# 2) 使用 ffmpeg-static 单文件二进制（本地/CI 可下载）
# 3) runner 仅装 server 生产依赖，pnpm store 装完即删
# 4) 清理文档 / 测试 / map 等无用文件

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
# 仅保留证书；不装系统 ffmpeg
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates; \
  rm -rf /var/lib/apt/lists/*; \
  corepack enable; \
  corepack prepare pnpm@9.15.0 --activate; \
  pnpm --version

# ---------- 全量依赖（构建） ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM deps AS build
WORKDIR /app
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @bokebox/shared build \
 && pnpm --filter @bokebox/web build \
 && pnpm --filter @bokebox/server build

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PNPM_STORE_DIR=/tmp/pnpm-store \
    npm_config_audit=false \
    npm_config_fund=false

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# 仅 server 生产依赖；store 放 /tmp，装完删除
RUN set -eux; \
  pnpm install --frozen-lockfile --prod --filter @bokebox/server...; \
  # 删除 store / 缓存（node_modules 内文件保留）
  rm -rf /tmp/pnpm-store /pnpm/store /root/.local/share/pnpm /root/.cache; \
  # 清理无用文件（保留 ffmpeg-static 二进制与 LICENSE）
  find node_modules -type f \( \
    -name '*.md' -o -name '*.markdown' -o -name 'CHANGELOG*' \
    -o -name '*.map' -o -name 'tsconfig*.json' \
  \) ! -path '*/ffmpeg-static/*' -delete; \
  find node_modules -type d \( \
    -name 'test' -o -name 'tests' -o -name '__tests__' \
    -o -name 'docs' -o -name 'example' -o -name 'examples' \
  \) -prune -exec rm -rf {} +; \
  # 去掉无关工作区残留
  rm -rf apps/web/node_modules packages/shared/node_modules /tmp/*; \
  # 确认 ffmpeg-static 二进制存在
  node -e "const p=require('ffmpeg-static'); if(!p) process.exit(1); console.log('ffmpeg-static', p)"

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

RUN node --input-type=module -e "await import('./apps/server/dist/services/content/scriptPrompt.js')" \
 && node --input-type=module -e "await import('sharp')" \
 && mkdir -p storage/jobs \
 && rm -rf /tmp/* /root/.cache

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
