// ============================================================
// 统一错误类型和错误码
// ============================================================

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RUN_TIMEOUT'
  | 'RUN_CANCELLED'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_CALL_DENIED'
  | 'AGENT_CALL_TIMEOUT'
  | 'AGENT_CALL_FAILED'
  | 'AGENT_MODE_NOT_SUPPORTED'
  | 'A2A_ASYNC_NOT_IMPLEMENTED'
  | 'TOOL_CALL_FAILED'
  | 'MODEL_CALL_FAILED'
  | 'MODEL_TIMEOUT'
  | 'RATE_LIMIT'
  | 'BUDGET_EXCEEDED'
  | 'ARTIFACT_SAVE_FAILED'
  | 'OUTPUT_VALIDATION_FAILED'
  | 'INTERNAL_ERROR'

// HTTP 状态码映射
const STATUS_CODE_MAP: Partial<Record<AppErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  BUDGET_EXCEEDED: 402,
  INTERNAL_ERROR: 500,
  MODEL_CALL_FAILED: 502,
  AGENT_CALL_TIMEOUT: 504,
  RUN_TIMEOUT: 504,
}

export class AppError extends Error {
  public readonly code: AppErrorCode
  public readonly statusCode: number
  public readonly retryable: boolean
  public readonly details?: unknown
  public readonly cause?: unknown

  constructor(
    code: AppErrorCode,
    message: string,
    options?: {
      statusCode?: number
      retryable?: boolean
      details?: unknown
      cause?: unknown
    },
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = options?.statusCode ?? STATUS_CODE_MAP[code] ?? 500
    this.retryable = options?.retryable ?? false
    this.details = options?.details
    this.cause = options?.cause
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    }
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
