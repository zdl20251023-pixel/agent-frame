import type { AuthResponse, PublicUser } from '@agent-frame/shared'
import { AuthRepository } from './auth.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { signAccessToken } from '../../shared/auth/jwt.js'
import { generateUserId } from '../../shared/utils/id.js'
import { mysqlNow } from '../../shared/db/datetime.js'

// ============================================================
// 认证业务逻辑
// ============================================================

export class AuthService {
  constructor(private repo = new AuthRepository()) {}

  async register(input: {
    email: string
    password: string
    username?: string
  }): Promise<AuthResponse> {
    const email = input.email.trim().toLowerCase()
    const password = input.password
    if (!email) throw new AppError('BAD_REQUEST', 'Email is required')
    if (!password || password.trim() === '') {
      throw new AppError('BAD_REQUEST', 'Password is required')
    }

    const passwordHash = await Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: 10,
    })

    const ts = mysqlNow()
    const user = await this.repo.createUser({
      id: generateUserId(),
      email,
      username: input.username?.trim() || undefined,
      passwordHash,
      createdAt: ts,
      updatedAt: ts,
    })

    return this.buildAuthResponse(user)
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const email = input.email.trim().toLowerCase()
    const password = input.password
    if (!email || !password) {
      throw new AppError('BAD_REQUEST', 'Email and password are required')
    }

    const user = await this.repo.findByEmail(email)
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password')
    }

    const valid = await Bun.password.verify(password, user.passwordHash)
    if (!valid) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password')
    }

    return this.buildAuthResponse(user)
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.repo.findPublicUserById(userId)
    if (!user) throw new AppError('UNAUTHORIZED', 'Unauthorized')
    return user
  }

  /**
   * 刷新 accessToken：验证旧 token 仍有效，重新签发新 token
   * MVP 阶段无 refresh_tokens 表，使用无状态验证
   */
  async refreshToken(accessToken: string): Promise<AuthResponse> {
    const { verifyAccessToken } = await import('../../shared/auth/jwt.js')
    let payload: Awaited<ReturnType<typeof verifyAccessToken>>
    try {
      payload = await verifyAccessToken(accessToken)
    } catch {
      throw new AppError('UNAUTHORIZED', 'Token is invalid or expired')
    }
    const user = await this.repo.findById(payload.sub)
    if (!user) throw new AppError('UNAUTHORIZED', 'User not found')
    return this.buildAuthResponse(user)
  }

  /** 更新用户资料（username 等可变字段）*/
  async updateProfile(userId: string, updates: { username?: string }): Promise<PublicUser> {
    if (!updates.username) throw new AppError('BAD_REQUEST', 'Nothing to update')
    const username = updates.username.trim()
    if (!username) throw new AppError('BAD_REQUEST', 'Username cannot be empty')
    await this.repo.updateUser(userId, { username })
    const user = await this.repo.findPublicUserById(userId)
    if (!user) throw new AppError('INTERNAL_ERROR', 'User not found after update')
    return user
  }

  /** 修改密码：校验当前密码，加密后更新 */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.repo.findById(userId)
    if (!user) throw new AppError('UNAUTHORIZED', 'Unauthorized')

    const valid = await Bun.password.verify(input.currentPassword, user.passwordHash)
    if (!valid) throw new AppError('UNAUTHORIZED', 'Current password is incorrect')

    if (input.newPassword.length < 6) {
      throw new AppError('BAD_REQUEST', 'New password must be at least 6 characters')
    }

    const newHash = await Bun.password.hash(input.newPassword, { algorithm: 'bcrypt', cost: 10 })
    await this.repo.updateUser(userId, { passwordHash: newHash })
  }

  private async buildAuthResponse(user: {
    id: string
    email: string
    username?: string
    createdAt: string
  }): Promise<AuthResponse> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
    })
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
      accessToken,
    }
  }
}

export const authService = new AuthService()
