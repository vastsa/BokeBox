#!/usr/bin/env bash
# Person Boke · 一键启动
# 用法:
#   ./start.sh            本地开发（前后端热更新）
#   ./start.sh prod       本地生产模式（构建后仅启服务端）
#   ./start.sh docker     Docker Compose 本地构建并启动
#   ./start.sh docker:prod  拉取 GHCR 生产镜像并启动
#   ./start.sh docker:down  停止并移除容器
#   ./start.sh stop       停止本地后台进程（若用了 --detach）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${1:-dev}"
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
CYAN=$'\033[0;36m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

log()  { printf "%s▶%s %s\n" "$CYAN" "$NC" "$*"; }
ok()   { printf "%s✓%s %s\n" "$GREEN" "$NC" "$*"; }
warn() { printf "%s!%s %s\n" "$YELLOW" "$NC" "$*"; }
err()  { printf "%s✗%s %s\n" "$RED" "$NC" "$*" >&2; }

ensure_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      warn "已从 .env.example 生成 .env，请按需填写 OPENAI_API_KEY"
    else
      err "缺少 .env 与 .env.example"
      exit 1
    fi
  else
    ok ".env 已就绪"
  fi
}

ensure_storage() {
  mkdir -p storage/jobs
  [[ -f storage/jobs/.gitkeep ]] || touch storage/jobs/.gitkeep
  ok "storage 目录已就绪（jobs/{id}/ 布局）"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "未找到命令: $1"
    return 1
  fi
}

ensure_node() {
  need_cmd node || { err "请安装 Node.js >= 22.5"; exit 1; }
  local ver major minor
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  minor="$(echo "$ver" | cut -d. -f2)"
  if (( major < 22 )) || { (( major == 22 )) && (( minor < 5 )); }; then
    err "当前 Node $ver，需要 >= 22.5（node:sqlite）"
    exit 1
  fi
  ok "Node $(node -v)"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm $(pnpm -v)"
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    log "启用 corepack 安装 pnpm@9.15.0 …"
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
    ok "pnpm $(pnpm -v)"
    return
  fi
  err "未找到 pnpm，请先安装: npm i -g pnpm@9.15.0"
  exit 1
}

install_deps() {
  if [[ ! -d node_modules ]] || [[ ! -d apps/server/node_modules && ! -d node_modules/.pnpm ]]; then
    log "安装依赖 …"
    pnpm install
  else
    ok "依赖已存在（跳过 install；强制重装可执行 pnpm install）"
  fi
}

start_dev() {
  ensure_env
  ensure_storage
  ensure_node
  ensure_pnpm
  install_deps
  log "启动开发模式（web :5173 + server :8787）"
  echo
  ok "前台: http://localhost:5173"
  ok "后台: http://localhost:8787"
  ok "管理: http://localhost:5173/#/admin"
  echo
  exec pnpm dev
}

start_prod() {
  ensure_env
  ensure_storage
  ensure_node
  ensure_pnpm
  install_deps
  log "构建前端与后端 …"
  pnpm build
  log "启动生产服务（托管 web dist）…"
  echo
  ok "访问: http://localhost:${PORT:-8787}"
  ok "管理: http://localhost:${PORT:-8787}/#/admin"
  echo
  exec pnpm --filter @person-boke/server start
}

docker_up() {
  ensure_env
  ensure_storage
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      COMPOSE=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE=(docker-compose)
    else
      err "已安装 docker，但未找到 compose 插件"
      exit 1
    fi
  else
    err "未安装 Docker。请安装 Docker Desktop 后再试"
    exit 1
  fi

  log "Docker Compose 构建并启动 …"
  "${COMPOSE[@]}" up -d --build
  echo
  ok "容器已启动: person-boke"
  ok "访问: http://localhost:${PORT:-8787}"
  ok "管理: http://localhost:${PORT:-8787}/#/admin"
  ok "日志: ${COMPOSE[*]} logs -f person-boke"
  ok "停止: ./start.sh docker:down"
}

docker_down() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    err "未找到 docker compose"
    exit 1
  fi
  # 同时尝试本地 build 与 prod 编排
  "${COMPOSE[@]}" down 2>/dev/null || true
  if [[ -f docker-compose.prod.yml ]]; then
    "${COMPOSE[@]}" -f docker-compose.prod.yml down 2>/dev/null || true
  fi
  ok "容器已停止"
}

docker_prod() {
  ensure_env
  ensure_storage
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      COMPOSE=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE=(docker-compose)
    else
      err "已安装 docker，但未找到 compose 插件"
      exit 1
    fi
  else
    err "未安装 Docker。请安装 Docker Desktop 后再试"
    exit 1
  fi

  if [[ ! -f docker-compose.prod.yml ]]; then
    err "缺少 docker-compose.prod.yml"
    exit 1
  fi

  export GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/vastsa/person-boke}"
  export IMAGE_TAG="${IMAGE_TAG:-latest}"
  log "拉取生产镜像 ${GHCR_IMAGE}:${IMAGE_TAG} …"
  "${COMPOSE[@]}" -f docker-compose.prod.yml pull
  log "启动生产容器 …"
  "${COMPOSE[@]}" -f docker-compose.prod.yml up -d
  echo
  ok "容器已启动: person-boke（GHCR 镜像）"
  ok "访问: http://localhost:${PORT:-8787}"
  ok "日志: ${COMPOSE[*]} -f docker-compose.prod.yml logs -f"
  ok "停止: ./start.sh docker:down"
}


usage() {
  cat <<USAGE
Person Boke · 一键启动

用法:
  ./start.sh              本地开发（热更新）
  ./start.sh prod         本地生产（构建后单端口）
  ./start.sh docker       Docker Compose 本地构建启动
  ./start.sh docker:prod  拉取 GHCR 镜像启动
  ./start.sh docker:down  停止 Docker 容器
  ./start.sh help         显示帮助

环境变量见 .env / .env.example
USAGE
}

case "$MODE" in
  dev|start|"")
    start_dev
    ;;
  prod|production)
    start_prod
    ;;
  docker|up)
    docker_up
    ;;
  docker:prod|prod-docker)
    docker_prod
    ;;
  docker:down|down)
    docker_down
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    err "未知模式: $MODE"
    usage
    exit 1
    ;;
esac
