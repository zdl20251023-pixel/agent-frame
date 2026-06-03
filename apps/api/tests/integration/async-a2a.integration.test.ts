import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { A2APolicy } from '../../src/a2a/a2a-policy.js'
import { A2ARouter } from '../../src/a2a/a2a-router.js'
import { A2AClient } from '../../src/a2a/a2a-client.js'
import { AgentTaskWorker } from '../../src/queues/agent-task.worker.js'
import { agentTaskStore } from '../../src/queues/agent-task.store.js'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'
import { env } from '../../src/shared/config/env.js'
import type { AgentInput, A2ARequest } from '@agent-frame/shared'
import { AGENT_TASK_STATUSES } from '@agent-frame/shared'
import { getDb } from '../../src/shared/db/client.js'
import { agentTasks } from '../../src/shared/db/schema.js'
import { eq } from 'drizzle-orm'

const hasDb = Boolean(env.DATABASE_URL)

describe.skipIf(!hasDb)('Async A2A and Worker Integration Tests', () => {
  let policy: A2APolicy
  let router: A2ARouter
  let client: A2AClient
  let store: MemoryRunStore
  let worker: AgentTaskWorker
  let createdTaskIds: string[] = []

  beforeEach(() => {
    store = new MemoryRunStore()
    policy = new A2APolicy({
      maxDepth: 3,
      maxCallsPerRun: 10,
      defaultTimeoutMs: 5000,
    })
    router = new A2ARouter()
    client = new A2AClient(store, policy, router)
    worker = new AgentTaskWorker(store, router, { enabled: true, pollIntervalMs: 1000 })
    createdTaskIds = []

    // Register test agents
    router.register({
      agentId: 'agent-a',
      execute: async (_input: AgentInput<any>) => ({ output: { ok: true } }),
    })
    router.register({
      agentId: 'agent-b',
      execute: async (input: AgentInput<any>) => {
        if (input.payload?.fail) {
          throw new Error('DENIED: Task execution failed deliberately')
        }
        return { output: { processed: true, data: input.payload } }
      },
    })

    policy.allow('agent-a', ['agent-b'])
  })

  afterEach(async () => {
    // Clean up created tasks from the real test database
    const db = getDb()
    for (const id of createdTaskIds) {
      try {
        await db.delete(agentTasks).where(eq(agentTasks.id, id))
      } catch {
        // ignore cleanup errors
      }
    }
  })

  it('should queue an async task and execute it via the worker successfully', async () => {
    const context = {
      runId: 'run-async-1',
      traceId: 'trace-async-1',
      depth: 0,
      callCount: 0,
      signal: new AbortController().signal,
    }

    const req: A2ARequest = {
      runId: 'run-async-1',
      traceId: 'trace-async-1',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      input: { hello: 'world' },
      mode: 'async',
    }

    // 1. Submit the async task
    const { taskId, childRunId } = await client.startAsync(req, context)
    createdTaskIds.push(taskId)

    expect(taskId).toBeDefined()
    expect(childRunId).toBeDefined()

    // 2. Verify task is queued in database
    const task = await agentTaskStore.findById(taskId)
    expect(task).not.toBeNull()
    expect(task?.status).toBe(AGENT_TASK_STATUSES.QUEUED)
    expect(task?.toAgentId).toBe('agent-b')

    // 3. Process task using worker
    const processedCount = await worker.processNextBatch()
    expect(processedCount).toBe(1)

    // 4. Verify task status is updated to completed
    const completedTask = await agentTaskStore.findById(taskId)
    expect(completedTask?.status).toBe(AGENT_TASK_STATUSES.COMPLETED)
    expect(completedTask?.output).toEqual({ processed: true, data: { hello: 'world' } })

    // 5. Verify run events contain completion events
    const events = await store.listEvents('run-async-1')
    const eventTypes = events.map(e => e.type)
    expect(eventTypes).toContain('agent.call.queued')
    expect(eventTypes).toContain('agent.call.started')
    expect(eventTypes).toContain('agent.call.completed')
  })

  it('should mark task as failed if execution throws an error', async () => {
    const context = {
      runId: 'run-async-2',
      traceId: 'trace-async-2',
      depth: 0,
      callCount: 0,
      signal: new AbortController().signal,
    }

    const req: A2ARequest = {
      runId: 'run-async-2',
      traceId: 'trace-async-2',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      input: { fail: true },
      mode: 'async',
    }

    // 1. Submit failing async task
    const { taskId } = await client.startAsync(req, context)
    createdTaskIds.push(taskId)

    // 2. Process task using worker
    await worker.processNextBatch()

    // 3. Verify task failed in database
    const failedTask = await agentTaskStore.findById(taskId)
    expect(failedTask?.status).toBe(AGENT_TASK_STATUSES.FAILED)
    expect(failedTask?.error?.message).toContain('Task execution failed deliberately')

    // 4. Verify run events contain failure events
    const events = await store.listEvents('run-async-2')
    const eventTypes = events.map(e => e.type)
    expect(eventTypes).toContain('agent.call.queued')
    expect(eventTypes).toContain('agent.call.started')
    expect(eventTypes).toContain('agent.call.failed')
  })
})
