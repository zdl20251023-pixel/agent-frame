import { describe, expect, it } from 'bun:test'
import type { AgentInput } from '@agent-frame/shared'
import { MemoryArtifactStore } from '../../src/artifacts/artifact-store.memory.js'
import {
  NL_TO_HAND_AGENT_ID,
  SUPERVISOR_AGENT_ID,
} from '../../src/ai/agents/agent-ids.js'
import { RunsService } from '../../src/features/runs/runs.service.js'
import { RunManager } from '../../src/runtime/run-manager.js'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'

describe('Capability routing integration', () => {
  it('should resolve default supervisor request to nl-to-hand-agent for high-confidence poker input', async () => {
    const store = new MemoryRunStore()
    let executedAgentId = ''
    const runManager = new RunManager(store, {
      agentId: 'test-router',
      execute: async (_input: AgentInput, context) => {
        executedAgentId = context.agentId ?? ''
        return { output: { executedAgentId } }
      },
    })
    const service = new RunsService(
      runManager,
      store,
      new MemoryArtifactStore(),
      fakeSessionsService(),
      fakeConversationContextBuilder(),
    )

    const result = await service.createRun({
      userId: 'user-capability',
      sessionId: 'sess-capability',
      agentId: SUPERVISOR_AGENT_ID,
      input: { message: '6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌，帮我生成标准牌谱' },
    })
    const run = await waitForRun(store, result.runId)

    expect(result.resolvedAgentId).toBe(NL_TO_HAND_AGENT_ID)
    expect(executedAgentId).toBe(NL_TO_HAND_AGENT_ID)
    expect(run.agentId).toBe(NL_TO_HAND_AGENT_ID)
  })
})

function fakeSessionsService() {
  return {
    resolveSessionId: async (_userId: string, sessionId?: string) => sessionId ?? 'sess-capability',
    touchSession: async (_sessionId: string) => {},
    maybeSetTitleFromMessage: async (_sessionId: string, _userId: string, _message: string) => {},
    assertRunOwnedByUser: async (_runId: string, _userId: string) => {},
  } as any
}

function fakeConversationContextBuilder() {
  return {
    build: async () => undefined,
  } as any
}

async function waitForRun(store: MemoryRunStore, runId: string) {
  for (let i = 0; i < 40; i += 1) {
    const run = await store.getRun(runId)
    if (run && run.status !== 'queued' && run.status !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Run did not finish: ${runId}`)
}
