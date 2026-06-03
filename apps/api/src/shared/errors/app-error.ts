// ============================================================
// 统一错误类
// AppErrorCode 定义在 @agent-frame/shared，前后端共用
// ============================================================

import { type AppErrorCode, ERROR_HTTP_STATUS } from '@agent-frame/shared'

export type { AppErrorCode }

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
    this.statusCode = options?.statusCode ?? ERROR_HTTP_STATUS[code] ?? 500
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
