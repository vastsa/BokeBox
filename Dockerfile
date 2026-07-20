# BokeBox · 生产镜像（体积优化）
# 服务端 dist + 前端 dist，Fastify 同端口托管
#
# 体积策略：
# 1) 系统 ffmpeg，最终镜像剔除 ffmpeg-static（~40–80MB）
# 2) runner 使用 hoisted + copy，装完删除 pnpm store / 缓存
# 3) 清理 node_modules 内文档、测试、map、源码残留

FROM node:22-bookworm-slim AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    FFMPEG_BIN=/usr/bin/ffmpeg

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates ffmpeg; \
  rm -rf /var/lib/apt/lists/*; \
  corepack enable; \
  corepack prepare pnpm@9.15.0 --activate; \
  ffmpeg -version | head -n 1; \
  pnpm --version

# ---------- 依赖（构建用，含 devDependencies） ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
# 构建不需要真正的 ffmpeg 二进制；跳过 postinstall 可避免额外下载耗时
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm rebuild sharp

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
    FFMPEG_BIN=/usr/bin/ffmpeg \
    PNPM_STORE_DIR=/tmp/pnpm-store \
    npm_config_audit=false \
    npm_config_fund=false

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# hoisted + copy：最终层不依赖 content-addressable store
RUN set -eux; \
  printf '%s\n' \
    'node-linker=hoisted' \
    'package-import-method=copy' \
    'shamefully-hoist=true' \
    > .npmrc; \
  pnpm install --frozen-lockfile --prod --filter @bokebox/server... --ignore-scripts; \
  pnpm rebuild sharp; \
  find node_modules -type d -name 'ffmpeg-static' -prune -exec rm -rf {} +; \
  find node_modules -type f \( \
    -name '*.md' -o -name '*.markdown' -o -name 'CHANGELOG*' \
    -o -name '*.map' -o -name 'tsconfig*.json' \
  \) -delete; \
  find node_modules -type d \( \
    -name 'test' -o -name 'tests' -o -name '__tests__' \
    -o -name 'docs' -o -name 'example' -o -name 'examples' \
  \) -prune -exec rm -rf {} +; \
  rm -rf \
    /tmp/pnpm-store \
    /pnpm/store \
    /root/.local/share/pnpm \
    /root/.cache \
    /tmp/* \
    .npmrc \
    apps/web/node_modules \
    packages/shared/node_modules

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# 门禁：shared 运行时、sharp、ffmpeg
RUN node --input-type=module -e "await import('./apps/server/dist/services/content/scriptPrompt.js')" \
 && node --input-type=module -e "await import('sharp')" \
 && test -x "$FFMPEG_BIN" \
 && mkdir -p storage/jobs \
 && rm -rf /tmp/* /root/.cache

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
