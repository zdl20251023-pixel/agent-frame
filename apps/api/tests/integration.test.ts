import { describe, it, expect, beforeEach } from 'bun:test'
import { RunManager } from '../src/runtime/run-manager.js'
import { MemoryRunStore } from '../src/runtime/stores/memory-run-store.js'
import { A2APolicy } from '../src/a2a/a2a-policy.js'
import { A2ARouter } from '../src/a2a/a2a-router.js'
import { A2AClient } from '../src/a2a/a2a-client.js'
import { MemoryArtifactStore } from '../src/artifacts/artifact-store.memory.js'
import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import type { RunContext } from '../src/runtime/run-manager.js'

// ============================================================
// 集成测试：Run 生命周期 + A2A + 事件流
// 使用内存存储，不需要真实数据库
// ============================================================

describe('Run Lifecycle', () => {
  let store: MemoryRunStore
  let runManager: RunManager

  beforeEach(() => {
    store = new MemoryRunStore()

    const policy = new A2APolicy()
    const a2aRouter = new A2ARouter()
    new A2AClient(store, policy, a2aRouter)
  })

  it('should create a run and return queued status', async () => {
    runManager = new RunManager(store, {
      agentId: 'test-agent',
      execute: async (_input: AgentInput, _ctx: RunContext): Promise<AgentOutput> => {
        return { output: { result: 'ok' } }
      },
    })

    const run = await runManager.createRun({
      input: { message: 'hello' },
      agentId: 'test-agent',
    })

    expect(run.id).toBeTruthy()
    expect(run.traceId).toBeTruthy()
    expect(run.status).toBe('queued')
    expect(run.input).toMatchObject({ message: 'hello' })
  })

  it('should complete a run and update status', async () => {
    runManager = new RunManager(store, {
      agentId: 'test-agent',
      execute: async (_input: AgentInput, _ctx: RunContext): Promise<AgentOutput> => {
        return { output: { result: 'completed' } }
      },
    })

    const run = await runManager.createRun({
      input: { message: 'test' },
    })

    // 等待异步执行完成
    await new Promise((resolve) => setTimeout(resolve, 100))

    const updatedRun = await runManager.getRun(run.id)
    expect(updatedRun?.status).toBe('completed')
    expect((updatedRun?.output as any)?.result).toBe('completed')
  })

  it('should record events during run', async () => {
    runManager = new RunManager(store, {
      agentId: 'test-agent',
      execute: async (_input: AgentInput, _ctx: RunContext): Promise<AgentOutput> => {
        return { output: {} }
      },
    })

    const run = await runManager.createRun({ input: {} })
    await new Promise((resolve) => setTimeout(resolve, 100))

    const events = await runManager.listEvents(run.id)
    const eventTypes = events.map((e) => e.type)

    expect(eventTypes).toContain('run.started')
    expect(eventTypes).toContain('run.completed')
  })

  it('should cancel a running run', async () => {
    runManager = new RunManager(store, {
      agentId: 'slow-agent',
      execute: async (_input: AgentInput, ctx: RunContext): Promise<AgentOutput> => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000)
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            const err = new Error('AbortError')
            err.name = 'AbortError'
            reject(err)
          })
        })
        return { output: {} }
      },
    })

    const run = await runManager.createRun({ input: {} })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const cancelled = await runManager.cancelRun(run.id)
    expect(cancelled).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 100))

    const updatedRun = await runManager.getRun(run.id)
    expect(updatedRun?.status).toBe('cancelled')
  })
})

describe('A2AClient', () => {
  it('should deny calls not in allowedCalls whitelist', async () => {
    const store = new MemoryRunStore()
    const policy = new A2APolicy()
    // 不注册任何允许的调用
    const router = new A2ARouter()
    const client = new A2AClient(store, policy, router)

    const run = await store.createRun({
      id: 'test-run-1',
      traceId: 'test-trace-1',
      input: {},
    })

    const context: RunContext = {
      runId: run.id,
      traceId: run.traceId!,
      signal: new AbortController().signal,
      depth: 0,
      callCount: 0,
      totalCostUsd: 0,
    }

    const response = await client.callSync(
      {
        runId: run.id,
        traceId: run.traceId!,
        fromAgentId: 'supervisor',
        toAgentId: 'research-agent',
        mode: 'sync',
        input: {},
        timeoutMs: 5000,
      },
      context,
    )

    expect(response.status).toBe('failed')
    expect(response.error?.code).toBe('AGENT_CALL_DENIED')
  })
})

describe('ArtifactStore', () => {
  it('should create artifact with version', async () => {
    const store = new MemoryArtifactStore()

    const { artifact, version } = await store.createArtifactWithVersion(
      {
        runId: 'test-run',
        type: 'research_report',
        title: '测试报告',
      },
      { content: '这是研究内容', generatedAt: new Date().toISOString() },
      { runId: 'test-run', agentId: 'research-agent' },
    )

    expect(artifact.id).toBeTruthy()
    expect(artifact.type).toBe('research_report')
    expect(artifact.currentVersionId).toBe(version.id)
    expect(version.version).toBe(1)
  })

  it('should retrieve artifact by id', async () => {
    const store = new MemoryArtifactStore()

    const { artifact } = await store.createArtifactWithVersion(
      { runId: 'run-1', type: 'summary', title: '摘要' },
      { summary: 'test' },
      { runId: 'run-1' },
    )

    const retrieved = await store.getArtifact(artifact.id)
    expect(retrieved?.id).toBe(artifact.id)
    expect(retrieved?.type).toBe('summary')
  })
})
