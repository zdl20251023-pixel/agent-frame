import { describe, it, expect } from 'bun:test'
import { authService } from '../../src/features/auth/auth.service.js'
import { env } from '../../src/shared/config/env.js'

const hasDb = Boolean(env.DATABASE_URL)

describe.skipIf(!hasDb)('Auth Integration Tests', () => {
  const email = `test-${Date.now()}@example.com`
  const password = 'secret123'

  it('should register and login', async () => {
    const reg = await authService.register({ email, password })
    expect(reg.accessToken).toBeTruthy()
    expect(reg.user.email).toBe(email)

    const login = await authService.login({ email, password })
    expect(login.accessToken).toBeTruthy()

    const me = await authService.me(reg.user.id)
    expect(me.id).toBe(reg.user.id)
  })

  it('should reject empty password on register', async () => {
    await expect(
      authService.register({ email: `empty-${Date.now()}@example.com`, password: '   ' }),
    ).rejects.toThrow()
  })
})
