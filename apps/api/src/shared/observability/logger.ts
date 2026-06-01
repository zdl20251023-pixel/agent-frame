// ============================================================
// 结构化日志
// 所有日志必须携带 traceId、runId 等关键上下文 ID
// 禁止直接使用 console.log
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = {
  traceId?: string
  runId?: string
  stepId?: string
  parentStepId?: string
  agentId?: string
  fromAgentId?: string
  toAgentId?: string
  workflowRunId?: string
  artifactId?: string
  userId?: string
  eventType?: string
  latencyMs?: number
  tokenInput?: number
  tokenOutput?: number
  costUsd?: number
  errorCode?: string
  [key: string]: unknown
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getCurrentLevel(): LogLevel {
  return (process.env.LOG_LEVEL as LogLevel) ?? 'info'
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLevel()]
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
  }
  return JSON.stringify(entry)
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (shouldLog('debug')) console.debug(formatLog('debug', message, context))
  },
  info(message: string, context?: LogContext) {
    if (shouldLog('info')) console.info(formatLog('info', message, context))
  },
  warn(message: string, context?: LogContext) {
    if (shouldLog('warn')) console.warn(formatLog('warn', message, context))
  },
  error(message: string, context?: LogContext) {
    if (shouldLog('error')) console.error(formatLog('error', message, context))
  },
  child(defaultContext: LogContext) {
    return {
      debug: (msg: string, ctx?: LogContext) => logger.debug(msg, { ...defaultContext, ...ctx }),
      info: (msg: string, ctx?: LogContext) => logger.info(msg, { ...defaultContext, ...ctx }),
      warn: (msg: string, ctx?: LogContext) => logger.warn(msg, { ...defaultContext, ...ctx }),
      error: (msg: string, ctx?: LogContext) => logger.error(msg, { ...defaultContext, ...ctx }),
    }
  },
}
