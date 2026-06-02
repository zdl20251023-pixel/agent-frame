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
