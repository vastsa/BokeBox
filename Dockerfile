# BokeBox · 生产镜像
# 构建产物：服务端 dist + 前端 dist，由 Fastify 同端口托管

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---------- 依赖安装 ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM deps AS build
COPY apps ./apps
RUN pnpm --filter @bokebox/web build \
 && pnpm --filter @bokebox/server build

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

# 仅安装生产依赖（含 ffmpeg-static）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --prod --filter @bokebox/server...

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# 运行时存储目录（挂载卷）：按任务聚合 jobs/{id}/
RUN mkdir -p storage/jobs

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
