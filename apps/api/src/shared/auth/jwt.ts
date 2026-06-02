import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'

// ============================================================
// JWT 签发与校验
// ============================================================

export type JwtPayload = {
  sub: string
  email: string
  username?: string
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET)
}

/**
 * 签发访问令牌。
 */
export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    username: payload.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(getSecretKey())
}

/**
 * 校验并解析访问令牌。
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecretKey())
  const sub = payload.sub
  if (!sub || typeof sub !== 'string') {
    throw new Error('Invalid token: missing sub')
  }
  return {
    sub,
    email: String(payload.email ?? ''),
    username: payload.username ? String(payload.username) : undefined,
  }
}
