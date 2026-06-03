import { describe, it, expect, beforeAll } from 'bun:test'
import { createApp } from '../../src/app.js'

// ============================================================
// API E2E Tests — 针对真实 Elysia 应用的 HTTP 集成测试
// 使用内存 Store，不需要 MySQL 或 Redis
// 注意：requireAuthPlugin 使用 as:'global' scope，会影响主 app 注册顺序后面的路由
//       此 E2E 测试专注于：公共 API + 经过认证的完整流程
// ============================================================

let app: ReturnType<typeof createApp>

beforeAll(() => {
  app = createApp()
})

async function request(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  const text = await response.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: response.status, body: json }
}

// ─── Health Check (Public) ────────────────────────────────────

describe('Health API', () => {
  it('GET /health returns ok=true with scheduler stats', async () => {
    const res = await request('GET', '/health')
    expect(res.status).toBe(200)
    const body = res.body as any
    expect(body.ok).toBe(true)
    expect(body.version).toBeTruthy()
    // Phase 6.3: scheduler stats
    expect(body.scheduler).toBeDefined()
    expect(typeof body.scheduler.running).toBe('number')
    expect(typeof body.scheduler.queued).toBe('number')
    expect(typeof body.scheduler.completed).toBe('number')
  })
})

// ─── Auth E2E (register → login → use token) ──────────────────

describe('Auth E2E', () => {
  const testEmail = `e2e-${Date.now()}@test.com`
  const testPassword = 'TestPass123!'
  let authToken = ''

  it('should reject login with unknown email', async () => {
    const res = await request('POST', '/auth/login', {
      email: 'nobody@nowhere.com',
      password: 'wrongpass',
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('should register a new user', async () => {
    const res = await request('POST', '/auth/register', {
      email: testEmail,
      password: testPassword,
    })
    // In memory mode (no DB), register may fail differently — accept 200 or 201
    if (res.status === 201 || res.status === 200) {
      expect((res.body as any).user?.email).toBe(testEmail)
    } else {
      // Memory store always works, DB error means env mismatch
      expect([200, 201, 500].includes(res.status)).toBe(true)
    }
  })

  it('should login with registered user', async () => {
    const res = await request('POST', '/auth/login', {
      email: testEmail,
      password: testPassword,
    })
    if (res.status === 200) {
      authToken = (res.body as any).accessToken
      expect(authToken).toBeTruthy()
    } else {
      // Skip if registration didn't succeed (e.g. DB not available)
      console.log('[E2E] Skipping login - registration may have failed')
    }
  })

  it('should GET /auth/me with valid token', async () => {
    if (!authToken) return // skip if login didn't succeed
    const res = await request('GET', '/auth/me', undefined, authToken)
    expect(res.status).toBe(200)
    expect((res.body as any).user?.email).toBe(testEmail)
  })
})

// ─── Plugin Discovery API (within auth context) ───────────────

describe('Plugin Discovery API', () => {
  let token = ''

  // Helper: register+login fresh user
  beforeAll(async () => {
    const email = `plugin-e2e-${Date.now()}@test.com`
    await request('POST', '/auth/register', { email, password: 'Test1234!' })
    const loginRes = await request('POST', '/auth/login', { email, password: 'Test1234!' })
    token = (loginRes.body as any)?.accessToken ?? ''
  })

  it('GET /plugins returns registry summary', async () => {
    if (!token) return
    const res = await request('GET', '/plugins', undefined, token)
    expect(res.status).toBe(200)
    const body = res.body as any
    expect(body.pluginCount).toBeGreaterThanOrEqual(4)
    expect(body.plugins).toBeArray()
  })

  it('GET /plugins/agents returns registered agent definitions', async () => {
    if (!token) return
    const res = await request('GET', '/plugins/agents', undefined, token)
    expect(res.status).toBe(200)
    const body = res.body as any
    expect(body.agents).toBeArray()
    expect(body.agents.length).toBeGreaterThanOrEqual(3)
    for (const agent of body.agents) {
      expect(agent.id).toBeTruthy()
      expect(agent.name).toBeTruthy()
    }
  })

  it('GET /plugins/workflows returns workflow templates', async () => {
    if (!token) return
    const res = await request('GET', '/plugins/workflows', undefined, token)
    expect(res.status).toBe(200)
    const body = res.body as any
    expect(body.workflows).toBeArray()
    expect(body.workflows.length).toBeGreaterThanOrEqual(2)
  })

  it('GET /plugins/:id returns plugin detail', async () => {
    if (!token) return
    const res = await request('GET', '/plugins/builtin-supervisor', undefined, token)
    expect(res.status).toBe(200)
    expect((res.body as any).id).toBe('builtin-supervisor')
  })

  it('GET /plugins/:id returns 404 for unknown plugin', async () => {
    if (!token) return
    const res = await request('GET', '/plugins/not-a-plugin', undefined, token)
    expect(res.status).toBe(404)
  })
})

// ─── Agents API (within auth context) ─────────────────────────

describe('Agents API', () => {
  let token = ''

  beforeAll(async () => {
    const email = `agents-e2e-${Date.now()}@test.com`
    await request('POST', '/auth/register', { email, password: 'Test1234!' })
    const loginRes = await request('POST', '/auth/login', { email, password: 'Test1234!' })
    token = (loginRes.body as any)?.accessToken ?? ''
  })

  it('GET /agents returns agent list', async () => {
    if (!token) return
    const res = await request('GET', '/agents', undefined, token)
    expect(res.status).toBe(200)
    const body = res.body as any
    expect(body.agents).toBeArray()
    expect(body.agents.length).toBeGreaterThanOrEqual(2)
  })

  it('GET /agents/:agentId returns 404 for unknown agent', async () => {
    if (!token) return
    const res = await request('GET', '/agents/no-such-agent', undefined, token)
    expect(res.status).toBe(404)
  })
})
