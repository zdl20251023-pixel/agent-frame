import { describe, it, expect, beforeEach } from 'bun:test'
import { A2APolicy } from '../../src/a2a/a2a-policy.js'
import { A2ARouter } from '../../src/a2a/a2a-router.js'
import { A2AClient } from '../../src/a2a/a2a-client.js'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'
import type { AgentInput, A2ARequest } from '@agent-frame/shared'

describe('A2A Integration Tests', () => {
  let policy: A2APolicy
  let router: A2ARouter
  let client: A2AClient
  let store: MemoryRunStore

  beforeEach(() => {
    store = new MemoryRunStore()
    policy = new A2APolicy({
      maxDepth: 2,
      maxCallsPerRun: 5,
      defaultTimeoutMs: 1000,
    })
    router = new A2ARouter()
    client = new A2AClient(store, policy, router)

    // Setup mock agents
    router.register({
      agentId: 'agent-a',
      execute: async (_input: AgentInput<any>) => ({ output: { ok: true } }),
    })
    router.register({
      agentId: 'agent-b',
      execute: async (_input: AgentInput<any>) => ({ output: { ok: true } }),
    })
    router.register({
      agentId: 'agent-slow',
      execute: async (input: AgentInput<any>) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ output: { ok: true } }), 1500)
          if (input.signal) {
            input.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('timeout'))
            })
          }
        })
      },
    })

    // Allow a -> b, a -> slow
    policy.allow('agent-a', ['agent-b', 'agent-slow'])
  })

  it('should allow call if in whitelist', async () => {
    const context = { runId: 'r1', traceId: 't1', depth: 0, callCount: 0, signal: new AbortController().signal }
    const req: A2ARequest = {
      runId: 'r1',
      traceId: 't1',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      payload: {},
      mode: 'sync',
    }
    const res = await client.callSync(req, context)
    expect(res.status).toBe('completed')
  })

  it('should deny call if not in whitelist', async () => {
    const context = { runId: 'r1', traceId: 't1', depth: 0, callCount: 0, signal: new AbortController().signal }
    const req: A2ARequest = {
      runId: 'r1',
      traceId: 't1',
      fromAgentId: 'agent-b', // b not allowed to call a
      toAgentId: 'agent-a',
      payload: {},
      mode: 'sync',
    }
    const res = await client.callSync(req, context)
    expect(res.status).toBe('failed')
    expect(res.error?.code).toBe('AGENT_CALL_DENIED')
    expect(res.error?.message).toContain('Agent agent-b is not allowed to call agent-a')
  })

  it('should enforce max depth', async () => {
    const context = { runId: 'r1', traceId: 't1', depth: 0, callCount: 0, signal: new AbortController().signal }
    const req: A2ARequest = {
      runId: 'r1',
      traceId: 't1',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      payload: {},
      mode: 'sync',
    }

    // depth is incremented by client internally (so context.depth gets mutated)
    // we need to set context.depth to something high to trigger error easily, or loop it
    context.depth = 2
    const res = await client.callSync(req, context)
    expect(res.status).toBe('failed')
    expect(res.error?.code).toBe('AGENT_CALL_DENIED')
    expect(res.error?.message).toMatch(/Max A2A depth.*exceeded/)
  })

  it('should enforce max call count', async () => {
    const context = { runId: 'r1', traceId: 't1', depth: 0, callCount: 5, signal: new AbortController().signal }
    const req: A2ARequest = {
      runId: 'r1',
      traceId: 't1',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      payload: {},
      mode: 'sync',
    }

    const res = await client.callSync(req, context)
    expect(res.status).toBe('failed')
    expect(res.error?.code).toBe('AGENT_CALL_DENIED')
    expect(res.error?.message).toMatch(/Max.*calls.*exceeded/)
  })

  it('should enforce timeout', async () => {
    const context = { runId: 'r1', traceId: 't1', depth: 0, callCount: 0, signal: new AbortController().signal }
    const req: A2ARequest = {
      runId: 'r1',
      traceId: 't1',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-slow',
      payload: {},
      mode: 'sync',
      timeoutMs: 100, // explicit low timeout
    }
    const res = await client.callSync(req, context)
    expect(res.status).toBe('failed')
    expect(res.error?.code).toBe('AGENT_CALL_FAILED')
    expect(res.error?.message).toMatch(/timeout/i)
  })
})
