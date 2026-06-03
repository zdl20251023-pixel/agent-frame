# ============================================================
# Dockerfile — Agent Frame API
# 多阶段构建，最终镜像基于 oven/bun:1-alpine
#
# 构建命令：
#   docker build -f apps/api/Dockerfile -t agent-frame-api .
#
# 运行示例：
#   docker run -p 3099:3099 \
#     -e DATABASE_URL=mysql://... \
#     -e JWT_SECRET=your-secret \
#     -e GOOGLE_GENERATIVE_AI_API_KEY=your-key \
#     agent-frame-api
# ============================================================

# ─── Stage 1: 依赖安装 ────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /workspace

# 先复制 package.json 文件（利用 Docker 层缓存）
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# 安装生产依赖（跳过 devDependencies）
RUN bun install --frozen-lockfile --production

# ─── Stage 2: 构建 shared 包 ──────────────────────────────────
FROM oven/bun:1-alpine AS shared-builder

WORKDIR /workspace

COPY packages/shared/ ./packages/shared/
COPY package.json bun.lock tsconfig.json ./

WORKDIR /workspace/packages/shared
COPY --from=deps /workspace/node_modules ./node_modules
RUN bun run tsc --noEmit || true

# ─── Stage 3: 最终镜像 ────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# 安全：使用非 root 用户
RUN addgroup -g 1001 -S agentframe && \
    adduser -S -u 1001 -G agentframe agentframe

# 复制依赖
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/packages/shared/node_modules ./packages/shared/node_modules

# 复制源码（Bun 原生运行 TypeScript，无需编译）
COPY packages/shared/ ./packages/shared/
COPY apps/api/src/ ./apps/api/src/
COPY apps/api/package.json ./apps/api/
COPY package.json tsconfig.json ./

# 切换用户
USER agentframe

WORKDIR /app/apps/api

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3099}/health || exit 1

# 暴露端口
EXPOSE 3099

# 启动命令（bun 直接运行 TypeScript）
CMD ["bun", "run", "src/server.ts"]
