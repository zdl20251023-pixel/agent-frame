# ============================================================
# Dockerfile — Agent Frame Web (React + Vite)
# 多阶段构建：Bun 构建 → Nginx 服务静态文件
#
# 构建命令：
#   docker build -f apps/web/Dockerfile -t agent-frame-web .
#
# 运行示例：
#   docker run -p 80:80 agent-frame-web
# ============================================================

# ─── Stage 1: 构建 ────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /workspace

# 复制依赖清单（层缓存）
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN bun install --frozen-lockfile

# 复制源码
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# 构建生产 bundle
WORKDIR /workspace/apps/web
RUN bun run build

# ─── Stage 2: Nginx 静态服务 ──────────────────────────────────
FROM nginx:1.27-alpine AS runner

# SPA 路由支持：所有路径返回 index.html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health.txt || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
