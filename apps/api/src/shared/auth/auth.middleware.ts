import { Elysia } from 'elysia'
import { AppError } from '../errors/app-error.js'
import { verifyAccessToken } from './jwt.js'
import type { AuthUser } from './auth-context.js'
import { AuthRepository } from '../../features/auth/auth.repository.js'

const authRepo = new AuthRepository()

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

/** 从 Authorization 头或 query.token 提取 JWT（供 SSE EventSource 使用） */
function extractToken(request: Request): string | null {
  const headerToken = parseBearerToken(request.headers.get('authorization'))
  if (headerToken) return headerToken
  return new URL(request.url).searchParams.get('token')
}

/**
 * 解析 JWT 并加载用户；无 token 或无效时返回 null。
 */
async function resolveAuthUser(request: Request): Promise<AuthUser | null> {
  const token = extractToken(request)
  if (!token) return null
  try {
    const payload = await verifyAccessToken(token)
    return (await authRepo.findPublicUserById(payload.sub)) ?? null
  } catch {
    return null
  }
}

/**
 * 可选认证：有 token 则解析用户，无 token 不报错。
 * 使用 global，确保 .use() 之后在同实例上注册的路由也能拿到 authUser。
 */
export const optionalAuthPlugin = new Elysia({ name: 'optional-auth' }).derive(
  { as: 'global' },
  async ({ request }): Promise<{ authUser: AuthUser | null }> => {
    return { authUser: await resolveAuthUser(request) }
  },
)

/**
 * 必须登录：未带有效 token 时返回 401。
 */
export const requireAuthPlugin = new Elysia({ name: 'require-auth' })
  .derive({ as: 'global' }, async ({ request, set }): Promise<{ authUser: AuthUser }> => {
    const user = await resolveAuthUser(request)
    if (!user) {
      set.status = 401
      throw new AppError('UNAUTHORIZED', 'Unauthorized')
    }
    return { authUser: user }
  })
