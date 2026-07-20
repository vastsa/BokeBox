# BokeBox · 生产镜像（激进瘦身）
#
# 1) 全流程 Alpine，保证 sharp 拿到 musl 预编译
# 2) pnpm deploy 导出最小 server 闭包；最终层无 pnpm / monorepo
# 3) ffmpeg-static 单文件，不用发行版 ffmpeg 全家桶

FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=1
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate \
 && pnpm --version

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @bokebox/shared build \
 && pnpm --filter @bokebox/web build \
 && pnpm --filter @bokebox/server build

FROM build AS export
WORKDIR /app
RUN pnpm --filter @bokebox/server deploy --prod /out \
 && node -e "const p=require('/out/node_modules/ffmpeg-static'); if(!p) process.exit(1); console.log('ffmpeg', p)" \
 && node -e "require('/out/node_modules/sharp'); console.log('sharp ok')" \
 && find /out/node_modules -type f \( \
      -name '*.md' -o -name '*.markdown' -o -name 'CHANGELOG*' \
      -o -name '*.map' -o -name 'tsconfig*.json' -o -name '*.ts' \
    \) ! -path '*/ffmpeg-static/*' -delete || true \
 && find /out/node_modules -type d \( \
      -name 'test' -o -name 'tests' -o -name '__tests__' \
      -o -name 'docs' -o -name 'example' -o -name 'examples' \
      -o -name '.github' \
    \) -prune -exec rm -rf {} + || true \
 && rm -rf /out/node_modules/.cache /tmp/* /root/.local /root/.cache

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    BOKEBOX_ROOT=/app \
    WEB_DIST=/app/web \
    STORAGE_DIR=/app/storage
RUN apk add --no-cache libc6-compat \
 && rm -rf /var/cache/apk/*
COPY --from=export /out/ ./
COPY --from=build /app/apps/web/dist ./web
RUN node --input-type=module -e "await import('./dist/services/content/scriptPrompt.js')" \
 && node --input-type=module -e "await import('sharp')" \
 && node -e "const p=require('ffmpeg-static'); if(!p) process.exit(1)" \
 && mkdir -p /app/storage/jobs \
 && rm -rf /tmp/* /root/.npm /root/.cache
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
