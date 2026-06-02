import { describe, it, expect, beforeAll } from 'bun:test'
import { authService } from '../../src/features/auth/auth.service.js'
import { sessionsService } from '../../src/features/sessions/sessions.service.js'
import { container } from '../../src/container.js'
import { env } from '../../src/shared/config/env.js'

const hasDb = Boolean(env.DATABASE_URL)

describe.skipIf(!hasDb)('Sessions Integration Tests', () => {
  let userId: string

  beforeAll(async () => {
    sessionsService.setRunStore(container.store)
    const email = `sess-${Date.now()}@example.com`
    const reg = await authService.register({ email, password: 'pass' })
    userId = reg.user.id
  })

  it('should create, list, and soft-delete session', async () => {
    const session = await sessionsService.createSession(userId, '测试会话')
    expect(session.id).toMatch(/^sess-/)

    const { sessions } = await sessionsService.listSessions(userId)
    expect(sessions.some((s) => s.id === session.id)).toBeTrue()

    await sessionsService.deleteSession(userId, session.id)
    const after = await sessionsService.listSessions(userId)
    expect(after.sessions.some((s) => s.id === session.id)).toBeFalse()
  })
})
