import { describe, it, expect, beforeEach } from 'bun:test'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'
import { RunManager } from '../../src/runtime/run-manager.js'
import type { AgentInput } from '@agent-frame/shared'

describe('Runs Integration Tests', () => {
  let store: MemoryRunStore
  let runManager: RunManager

  beforeEach(() => {
    store = new MemoryRunStore()
    runManager = new RunManager(store, {
      agentId: 'mock-agent',
      execute: async (input: AgentInput<any>, ctx) => {
        // mock logic
        if (input.payload?.fail) throw new Error('Mock failure')
        return { output: { result: 'ok' } }
      },
    })
  })

  it('should create run and execute successfully', async () => {
    const createdRun = await runManager.createRun({
      input: { message: 'hello' },
    })
    
    expect(createdRun).toBeDefined()
    expect(createdRun.id.startsWith('run-')).toBeTrue()

    // Since createRun is async, wait a bit
    await new Promise(r => setTimeout(r, 50))
    
    const run = await store.getRun(createdRun.id)
    expect(run?.status).toBe('completed')
    expect(run?.output).toEqual({ result: 'ok' })
  })

  it('should handle run failure properly', async () => {
    const createdRun = await runManager.createRun({
      input: { fail: true },
    })

    await new Promise(r => setTimeout(r, 50))

    const run = await store.getRun(createdRun.id)
    expect(run?.status).toBe('failed')
    expect(run?.error).toBeDefined()
  })

  it('should list run events', async () => {
    const createdRun = await runManager.createRun({
      input: { message: 'hello' },
    })

    await new Promise(r => setTimeout(r, 50))

    const events = await store.listEvents(createdRun.id)
    expect(events.length).toBeGreaterThan(0)
    
    const types = events.map(e => e.type)
    expect(types).toContain('run.started')
    expect(types).toContain('run.completed')
  })
})
