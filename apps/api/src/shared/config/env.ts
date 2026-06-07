// ============================================================
// 环境变量读取和校验
// 启动时若缺少必要配置会提前报错，避免运行中才发现
// ============================================================

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

function optionalBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true'
}

export const env = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '3000'), 10),

  // 模型 Provider
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',

  // 数据库
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  /** 仅 development/test 允许 MemoryRunStore；生产必须配置 DATABASE_URL */
  ALLOW_MEMORY_STORE: optionalBooleanEnv('ALLOW_MEMORY_STORE', false),

  // Redis（可选，多实例 SSE / 队列）
  REDIS_URL: process.env.REDIS_URL ?? '',

  // 跨域
  WEB_ORIGIN: optionalEnv('WEB_ORIGIN', 'http://localhost:5173'),

  // Run 控制
  MAX_CONCURRENT_RUNS: parseInt(optionalEnv('MAX_CONCURRENT_RUNS', '5'), 10),
  RUN_TIMEOUT_MS: parseInt(optionalEnv('RUN_TIMEOUT_MS', '120000'), 10),

  // A2A 控制
  MAX_AGENT_CALLS_PER_RUN: parseInt(optionalEnv('MAX_AGENT_CALLS_PER_RUN', '8'), 10),
  MAX_A2A_DEPTH: parseInt(optionalEnv('MAX_A2A_DEPTH', '3'), 10),
  DEFAULT_A2A_TIMEOUT_MS: parseInt(optionalEnv('DEFAULT_A2A_TIMEOUT_MS', '30000'), 10),

  // 日志
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
  LOG_EVENT_DELTA: optionalBooleanEnv('LOG_EVENT_DELTA', false),

  // JWT
  JWT_SECRET: optionalEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  JWT_EXPIRES_IN: optionalEnv('JWT_EXPIRES_IN', '7d'),

  // 开发模式
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // 可观测性（可选）
  // 配置后 LangfuseBridge 自动激活，未配置则为 no-op
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY ?? '',
  LANGFUSE_BASE_URL: optionalEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com'),
} as const

export function validateEnv() {
  // 至少需要一个模型 Provider
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !env.DEEPSEEK_API_KEY && !env.GEMINI_API_KEY) {
    console.warn('[env] Warning: No model provider API key configured. AI calls will fail.')
  }
  if (!env.DATABASE_URL && env.isProd && !env.ALLOW_MEMORY_STORE) {
    throw new Error(
      '[env] FATAL: DATABASE_URL is required in production. Set ALLOW_MEMORY_STORE=true only for local dev.',
    )
  }
  if (!env.DATABASE_URL && !env.ALLOW_MEMORY_STORE) {
    console.warn('[env] Warning: DATABASE_URL not set. Using MemoryRunStore (data will be lost on restart).')
  }
}
