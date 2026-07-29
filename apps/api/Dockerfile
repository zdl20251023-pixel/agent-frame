# ============================================================
# Dockerfile — Agent Frame API
# 多阶段构建，最终镜像基于 oven/bun:1-alpine
#
# 构建命令（在仓库根目录执行）：
#   docker build -f apps/api/Dockerfile -t agent-frame-api:local .
#
# 运行示例：
#   docker run -p 3099:3099 \
#     -e DATABASE_URL=mysql://... \
#     -e JWT_SECRET=your-secret \
#     -e GOOGLE_GENERATIVE_AI_API_KEY=your-key \
#     agent-frame-api:local
# ============================================================

# ─── Stage 1: 依赖安装 ────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /workspace

# 先复制各 workspace 的 package.json（需与 bun.lock 中的 workspaces 对齐）
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# 安装生产依赖（跳过 devDependencies）
# Bun workspace 会把包链接到 apps/api/node_modules，实体在 node_modules/.bun
RUN bun install --frozen-lockfile --production

# ─── Stage 2: 最终镜像 ────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# 安全：使用非 root 用户
RUN addgroup -g 1001 -S agentframe && \
    adduser -S -u 1001 -G agentframe agentframe

# 先复制源码。packages/shared/ 整目录 COPY 可能清空 node_modules，
# 所以依赖目录必须放在源码 COPY 之后再覆盖写入。
COPY packages/shared/ ./packages/shared/
COPY apps/api/src/ ./apps/api/src/
COPY apps/api/package.json ./apps/api/
COPY package.json tsconfig.json ./

# 复制根 node_modules（含 .bun 全局存储）以及 API workspace 的链接目录
# 只拷根目录会丢 elysia 等包的解析入口，导致 Cannot find package 'elysia'
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/api/node_modules ./apps/api/node_modules

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
